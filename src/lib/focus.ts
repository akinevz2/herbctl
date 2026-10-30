// src/commands/focus.ts — get-focus: the hc_focus float-register
// machine (~/dots/herbst_focus/.local/bin/hc_focus, the $Mod-f key —
// distinct from get-zoom, which is hc_zoom on $ModCtrl-f):
//
//   Pre-scan the first VISIBLE float on the tag (the only candidate
//   the floating layer can focus; a fallback for the focus read that
//   may lag right after the layer switch).
//
//   floating_focused FALSE:
//     TRY the layer switch (floating_focused on; fails when no
//     non-minimized float exists).
//     Success -> the float it focused STAYS floating when the focused
//     frame holds children (no stacking); an EMPTY frame -> UN-FLOAT
//     the float into it (the register chain: fullscreen/pseudotile/
//     floating off — NO jumpto, the window is already focused; NO
//     floating_focused write — hlwm tracks the register on un-float).
//     Failure -> float the current window, but ONLY when the focused
//     frame's layout algorithm is "max": flags off, hc_center frame
//     (the size-keeping lift), close the vacated frame when it reads
//     zero clients (`remove` — Mod-f owns frame closing on this path),
//     hc_fit_to frame. Afterwards the focused frame is set to the max
//     algorithm regardless (the script's unconditional tail).
//
//   floating_focused TRUE (a float has focus): DIRECT un-float — no
//   hc_tile (that is Mod-x's register; the window re-tiles into the
//   frame below whatever it holds). The frame's client_count is read
//   first and unused — the script does exactly that.
//
//   NO script-level lock: the helpers take their own
//   reference-counted WM locks (hc_focus's header).

import { attrRaw, hc, helper, listClientsByTag } from "./hc.js";

export async function getFocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");

    // Pre-scan the first visible (non-minimized) float on the tag.
    let floatWid = "";
    if (tag) {
        for (const c of await listClientsByTag(tag)) {
            const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
            if (floating === "true") {
                const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
                if (minimized === "false") {
                    floatWid = c;
                    break;
                }
            }
        }
    }

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff !== "true") {
        // a) false; b) try the layer switch.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // c) switch succeeded. The PRE-SCANNED float wid is PRIMARY —
            // clients.focus may lag a settle-tick after the switch.
            const fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            const wid = floatWid || (await attrRaw("clients.focus.winid"));
            if (fcc === "0") {
                // e) un-float the float into the empty frame (no jumpto —
                // it is already focused; no register write — hlwm tracks
                // it on un-float).
                await hc(
                    "chain",
                    ",", "attr", `clients.${wid}.fullscreen`, "off",
                    ",", "attr", `clients.${wid}.pseudotile`, "off",
                    ",", "attr", `clients.${wid}.floating`, "off",
                );
            }
            // f) otherwise: terminate — the float stays floating, the
            // floating layer holds focus (no stacking).
            return;
        }

        // g) the switch failed (no float to focus): float the current
        // window — but ONLY in the max layout.
        const algo = await attrRaw("tags.focus.tiling.focused_frame.algorithm");
        if (algo === "max") {
            const wid = await attrRaw("clients.focus.winid");
            if (wid) {
                await hc(
                    "chain",
                    ",", "attr", `clients.${wid}.fullscreen`, "off",
                    ",", "attr", `clients.${wid}.pseudotile`, "off",
                );
                await helper("hc_center", ["frame"]);
                // The lifted window vacated its tile — when the focused
                // frame reads zero clients now, close it (Mod-f's
                // register; removes the split).
                const vcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "1";
                if (vcc === "0") {
                    await hc("remove");
                }
                await helper("hc_fit_to", ["frame"]);
            }
        }
        await hc("attr", "tags.focus.tiling.focused_frame.algorithm", "max");
        return;
    }

    // h) floating_focused TRUE: a floating window has focus. Direct
    // un-float — NO hc_tile (Mod-x's register).
    let wid = await attrRaw("clients.focus.winid");
    if (!wid) wid = floatWid;
    if (!wid) return;
    await attrRaw("tags.focus.tiling.focused_frame.client_count");
    await hc(
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    );
}
