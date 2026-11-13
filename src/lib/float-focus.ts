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

import { attrRaw, hc, setAttr } from "./hc.js";
import { fitTo, placeCenteredIn } from "./geometry.js";
import { firstVisibleFloat, floatFlagsChain } from "./imperatives.js";
import { tidyNoFloats } from "./extracted.js";

export async function floatFocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");
    const floatWid = await firstVisibleFloat(tag);

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff !== "true") {
        // a) false; b) try the layer switch.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // c) switch succeeded. The PRE-SCANNED float wid is PRIMARY —
            // clients.focus may lag a settle-tick after the switch.
            // SETTLE the client_count read: hlwm applies the layer
            // switch asynchronously, and a too-early read can race it
            // (misread 0 while the frame is still populating) and
            // UN-FLOAT the float into a POPULATED frame. The bash
            // script rode this out with ~40 ms of process-spawn
            // latency per hc() round trip; re-read after a settle —
            // un-float ONLY on a stable zero.
            let fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            if (fcc === "0") {
                await new Promise((r) => setTimeout(r, 80));
                fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            }
            const wid = floatWid || (await attrRaw("clients.focus.winid"));
            if (fcc === "0") {
                // e) un-float the float into the empty frame (no jumpto —
                // it is already focused; no register write — hlwm tracks
                // it on un-float).
                await floatFlagsChain(wid, "off");
            }
            // f) otherwise: terminate — the float stays floating, the
            // floating layer holds focus (no stacking).
            return;
        }

        // g) the switch failed (no float to focus): ModCtrl-z owns
        // float ADDS — no lift here. Fall to the tidying machinery
        // (shared with float-yank: remove the empty focused frame,
        // reveal minimized clients, polyframes hidden, use_previous).
        await tidyNoFloats();
        return;
    }

    // h) floating_focused TRUE: a floating window has focus. Direct
    // un-float — NO hc_tile (Mod-x's register).
    let wid = await attrRaw("clients.focus.winid");
    if (!wid) wid = floatWid;
    if (!wid) return;
    await attrRaw("tags.focus.tiling.focused_frame.client_count");
    await floatFlagsChain(wid, "off");
}
