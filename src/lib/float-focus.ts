// src/lib/float-focus.ts — float-focus: the hc_focus float-register
// machine (~/dots/herbst_focus/.local/bin/hc_focus, the $Mod-f key —
// distinct from zoom, which is hc_zoom on $ModCtrl-f):
//
//   Pre-scan the first VISIBLE float on the tag (the only candidate
//   the floating layer can focus; a fallback for the focus read that
//   may lag right after the layer switch).
//
//   floating_focused FALSE:
//     TRY the layer switch (floating_focused on; fails when no
//     non-minimized float exists).
//     Success -> the float layer is focused, the float STAYS
//     floating — TERMINATE. Mod-f never un-floats (the
//     grab-and-unfloat register is Mod-x's; the floating layer is
//     not destroyed by its focus key).
//     Failure -> float the current window, but ONLY when the focused
//     frame's layout algorithm is "max": flags off, hc_center frame
//     (the size-keeping lift), close the vacated frame when it reads
//     zero clients (`remove` — Mod-f owns frame closing on this path),
//     hc_fit_to frame. Afterwards the focused frame is set to the max
//     algorithm regardless (the script's unconditional tail).
//
//   floating_focused TRUE (a float has focus): UNFOCUS the float
//   layer — floating_focused off, the float PRESERVED (closing out
//   of the floating layer is Mod-x's register).
//
//   NO script-level lock: the helpers take their own
//   reference-counted WM locks (hc_focus's header).

import { attrRaw, hc, setAttr } from "./hc.js";
import { fitTo, placeCenteredIn } from "./geometry.js";
import { firstVisibleFloat } from "./imperatives.js";

export async function floatFocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");
    const floatWid = await firstVisibleFloat(tag);

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff !== "true") {
        // a) false; b) try the layer switch.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // c) switch succeeded — the float layer is focused, the
            // float stays floating. TERMINATE: Mod-f never un-floats
            // (no grab — the floating layer is not destroyed; the
            // grab-and-unfloat register is Mod-x's). Whether the
            // focused frame below is empty or populated is Mod-x's
            // concern.
            return;
        }

        // g) the switch failed (no float to focus): float the current
        // window — but ONLY in the max layout. ONE lock around the
        // whole lift (float + place + register + close-vacated + fit):
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
                    await setAttr(`clients.${wid}.floating`, "on");
                    await placeCenteredIn(wid, "tags.focus.tiling.focused_frame.content_geometry");
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
                    await fitTo(wid, "frame");
                } finally {
                    await hc("unlock");
                }
            }
        }
        await hc("attr", "tags.focus.tiling.focused_frame.algorithm", "max");
        return;
    }

    // h) floating_focused TRUE: a floating window has focus. UNFOCUS
    // the float layer — floating_focused off, the float PRESERVED
    // (no un-float: closing out of the floating layer is Mod-x's
    // register; Mod-f only moves the layer focus).
    await hc("attr", "tags.focus.floating_focused", "off");
}
