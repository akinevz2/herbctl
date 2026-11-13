// src/commands/zoom.ts — zoom: the hc_zoom press machine for the
// focused window (~/dots/herbst_focus/.local/bin/hc_zoom, bound as
// $ModCtrl-f in dots).
//
//   press 1  tiled      -> float it, stretched to fill the frame
//   press 2  floating   -> maximize onto a dedicated <tag>-max tag
//   press 3  maximized  -> restore to the original tag/frame
//
// Every branch ends centered inside the focused frame of the tag it
// lands on. The "-max" check MUST come before the floating check or a
// maximized window would be misread as tiled and re-floated instead of
// restored (hc_zoom's header). The maximize/restore record/restore
// state lives in hlwm env (PF_MAX_FRAME_<wid> / PF_MAX_WIN_<wid>) and
// is owned by the hc_maximize/hc_unmaximize helpers this delegates to
// — exactly as the script does — so the PF_MAX state handling (and the
// hc_maximize-daemon janitor they spawn) is preserved untouched.
//
// The geometry operations are the NATIVE geometry.ts machines now
// (placeCenteredIn / resizeFill / fitTo) — the hc_center/hc_resize/
// hc_fit_to helper spawns are gone; the sequence is composed in-process
// under ONE lock.

import { attr, attrRaw, hc, helper, setAttr } from "./hc.js";
import { fitTo, placeCenteredIn } from "./geometry.js";
import { resizeFill } from "./resize.js";

export async function zoomToggle(): Promise<boolean> {
    const wid = await attrRaw("clients.focus.winid");
    if (!wid) {
        console.error("zoom: no focused window");
        return false;
    }

    // Hold the WM lock across the whole toggle (hc_zoom's outer lock):
    // branch (a) runs the float + place + fill sequence, and without an
    // outer lock the window would be drawn at the centered geometry for
    // a frame before jumping to the frame-filling one (visible flash).
    // hlwm's lock is reference-counted, so the nested locks inside the
    // helpers stay balanced.
    if (!(await hc("lock"))) return false;
    try {
        const tag = await attr(`clients.${wid}.tag`);
        const floating = (await attr(`clients.${wid}.floating`)) || "false";

        if (tag?.endsWith("-max")) {
            // (c) maximized -> back to the original tag/frame
            await helper("hc_unmaximize", [wid]);
        } else if (floating === "true") {
            // (b) floating, not maximized -> dedicated max tag
            await helper("hc_maximize", [wid]);
        } else {
            // (a) tiled -> float the focused window directly: clear
            // stray fullscreen/pseudotile flags, float it ON (the
            // floating theme's decoration is what the geometry math
            // measures), place it centered inside the workspace rect,
            // foreground the float session (the historical
            // hc_center closing tail), then the deco-flush fill to the
            // frame content rect and the fit guard.
            await setAttr(`clients.${wid}.fullscreen`, "off");
            await setAttr(`clients.${wid}.pseudotile`, "off");
            await setAttr(`clients.${wid}.floating`, "on");
            await placeCenteredIn(wid, "tags.focus.tiling.root.content_geometry");
            await hc(
                "chain", ".",
                "try", "set_attr", "tags.focus.floating_focused", "on", ".",
                "jumpto", wid, ".",
                "bring", wid,
            );
            await resizeFill(wid, "frame");
            await fitTo(wid, "root");
        }
    } finally {
        await hc("unlock");
    }
    return true;
}
