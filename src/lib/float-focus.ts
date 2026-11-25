// src/lib/float-focus.ts — float-focus: the $Mod-f register machine
// (the float-session focus manager; distinct from zoom, which is
// $ModCtrl-f):
//
//   Pre-scan the first VISIBLE float on the tag (the only candidate
//   the floating layer can focus; a fallback for the focus read that
//   may lag right after the layer switch).
//
//   floating_focused FALSE:
//     TRY the layer switch (floating_focused on; fails when no
//     non-minimized float exists).
//     Success -> the float layer is focused, the float STAYS
//     floating — TERMINATE. Mod-f never un-floats on this branch (the
//     grab register is Mod-x's).
//     Failure -> float the current window, but ONLY when the focused
//     frame's layout algorithm is "max": flags off, PRE-LIFT floating
//     geometry recorded to hlwm env (PF_FLOAT_GEO_<wid>, reverted by
//     the unfloat branch), float on, then PSEUDO-FULLSCREEN: centered
//     in and fitted to the TAG ROOT geometry (NOT the focused frame —
//     the lift fills the whole tag area), close the vacated frame when
//     it reads zero clients (`remove` — Mod-f owns frame closing on
//     this path). Afterwards the focused frame is set to the max
//     algorithm regardless (the script's unconditional tail).
//
//   floating_focused TRUE (a float has focus): return it to the
//   TILING layer — un-float the focused window and REVERT its
//   floating size to the pre-lift record (the PF_FLOAT_GEO_<wid> env
//   the lift wrote; no record, nothing reverted), then the
//   floating_focused off follow-up. Mod-f is the toggle in both
//   directions; Mod-x is the shrink/step-aside register.
//
//   NO script-level lock: the helpers take their own
//   reference-counted WM locks (hc_focus's header).

import { attrRaw, hc, setAttr } from "./hc.js";
import { fitTo, placeCenteredIn } from "./geometry.js";
import { firstVisibleFloat, unfloatWid } from "./imperatives.js";

const GEO_RE = /^\d+x\d+\+\d+\+\d+$/;

/** Read the recorded pre-lift float geometry for <wid>, if any. */
async function savedFloatGeo(wid: string): Promise<string | null> {
    const out = (await hc("getenv", `PF_FLOAT_GEO_${wid}`))?.stdout ?? "";
    const v = out.trim();
    return GEO_RE.test(v) ? v : null;
}

export async function floatFocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");
    const floatWid = await firstVisibleFloat(tag);

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff !== "true") {
        // a) false; b) try the layer switch.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // c) switch succeeded — the float layer is focused, the
            // float stays floating. TERMINATE: Mod-f never un-floats
            // on this branch (the grab register is Mod-x's).
            return;
        }

        // g) the switch failed (no float to focus): float the current
        // window — but ONLY in the max layout. ONE lock around the
        // whole lift (float + place + record + close-vacated + fit):
        // the native geometry machines take no locks of their own.
        const algo = await attrRaw("tags.focus.tiling.focused_frame.algorithm");
        if (algo === "max") {
            const wid = await attrRaw("clients.focus.winid");
            if (wid) {
                await hc("lock");
                try {
                    await hc(
                        "chain",
                        ",", "attr", `clients.${wid}.fullscreen`, "off",
                        ",", "attr", `clients.${wid}.pseudotile`, "off",
                    );
                    // Record the PRE-LIFT floating geometry (when the
                    // window floated before) — the unfloat branch
                    // reverts to it, so the pseudo-fullscreen lift
                    // never clobbers the window's remembered float
                    // size.
                    const preGeo = (await attrRaw(`clients.${wid}.floating_geometry`)) || "";
                    if (GEO_RE.test(preGeo)) {
                        await hc("setenv", `PF_FLOAT_GEO_${wid}`, preGeo);
                    }
                    await setAttr(`clients.${wid}.floating`, "on");
                    // PSEUDO-FULLSCREEN: centered in + fitted to the
                    // TAG ROOT geometry, NOT the focused frame.
                    await placeCenteredIn(wid, "tags.focus.tiling.root.content_geometry");
                    // Foreground the float session (the historical
                    // hc_center closing tail).
                    await hc(
                        "chain", ".",
                        "try", "set_attr", "tags.focus.floating_focused", "on", ".",
                        "jumpto", wid, ".",
                        "bring", wid,
                    );
                    // The lifted window vacated its tile — when the focused
                    // frame reads zero clients now, close it (Mod-f's
                    // register; removes the split).
                    const vcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "1";
                    if (vcc === "0") {
                        await hc("remove");
                    }
                    await fitTo(wid, "root");
                } finally {
                    await hc("unlock");
                }
            }
        }
        await hc("attr", "tags.focus.tiling.focused_frame.algorithm", "max");
        return;
    }

    // h) floating_focused TRUE: a floating window has focus. RETURN it
    // to the tiling layer: un-float the focused window, reverting its
    // floating size to the pre-lift record (the lift's PF_FLOAT_GEO
    // env write; no record — nothing reverted), then the
    // floating_focused off follow-up (hlwm tracks the register on
    // un-float; the write stays idempotent for the no-focused edge).
    const orig = await attrRaw("clients.focus.winid");
    if (orig) {
        const saved = await savedFloatGeo(orig);
        if (saved) {
            await setAttr(`clients.${orig}.floating_geometry`, saved);
            await hc("unsetenv", `PF_FLOAT_GEO_${orig}`);
        }
        await unfloatWid(orig);
    }
    await hc("attr", "tags.focus.floating_focused", "off");
}
