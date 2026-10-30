// src/commands/zoom.ts — get-zoom: the hc_zoom press machine for the
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

import { attrRaw, hc, helper } from "./hc.js";

export async function getZoom(): Promise<boolean> {
    const wid = await attrRaw("clients.focus.winid");
    if (!wid) {
        console.error("get-zoom: no focused window");
        return false;
    }

    // Hold the WM lock across the whole toggle (hc_zoom's outer lock):
    // branch (a) runs hc_center followed by hc_resize, and without an
    // outer lock the window would be drawn at the centered geometry for
    // a frame before jumping to the frame-filling one (visible flash).
    // hlwm's lock is reference-counted, so the nested locks inside the
    // helpers stay balanced.
    if (!(await hc("lock"))) return false;
    try {
        const tag = await attrRaw(`clients.${wid}.tag`);
        const floating = (await attrRaw(`clients.${wid}.floating`)) || "false";

        if (tag.endsWith("-max")) {
            // (c) maximized -> back to the original tag/frame
            await helper("hc_unmaximize", [wid]);
        } else if (floating === "true") {
            // (b) floating, not maximized -> dedicated max tag
            await helper("hc_maximize", [wid]);
        } else {
            // (a) tiled -> float the focused window directly: clear
            // stray fullscreen/pseudotile flags, then hc_center root
            // floats it, centers it inside its focused frame and
            // focuses it; hc_resize <wid> frame is the deco-flush fill
            // and hc_fit_to root the idempotent guard.
            await hc("attr", `clients.${wid}.fullscreen`, "off");
            await hc("attr", `clients.${wid}.pseudotile`, "off");
            await helper("hc_center", ["root"]);
            await helper("hc_resize", [wid, "frame"]);
            await helper("hc_fit_to", ["root"]);
        }
    } finally {
        await hc("unlock");
    }
    return true;
}
