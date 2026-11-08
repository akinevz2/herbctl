// src/lib/imperatives.ts — the small imperative compositions shared by
// the state machines below (ports of the hc_floatx / scrollFocus
// building blocks; polyframes composes the same steps inline).
//
// Fail-soft everywhere (the dots wrapper convention): a failed
// herbstclient call resolves null instead of throwing.

import { attrRaw, attrValue, hc, helper } from "./hc.js";

/**
 * un-float a float by wid and focus it (hc_floatx's unfloat_wid): fold
 * the fullscreen/pseudotile flags, floating off, then jumpto. The
 * chain is intentionally fail-soft (2>/dev/null || true in the
 * source).
 */
export async function unfloatWid(wid: string): Promise<void> {
    await hc(
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    );
    await hc("jumpto", wid);
}

/**
 * Float a window and center it within the FOCUSED frame's content
 * geometry (the scrollFocus "float + center to frame" composition):
 * floating on, then hc_center frame — under a lock so both land in one
 * motion (no intermediate paint of the uncentered float). The vacated
 * frame is deliberately left in place.
 */
export async function floatCenterFrame(wid: string): Promise<void> {
    await hc("lock");
    try {
        await hc("set_attr", `clients.${wid}.floating`, "true");
        await helper("hc_center", ["frame"]);
    } finally {
        await hc("unlock");
    }
}

/**
 * Minimize a window while deliberately KEEPING its frame (the
 * scrollFocus down step of the escalation ladder — tiled windows
 * minimize without the frame-removal dance).
 */
export async function minimizeKeepFrame(wid: string): Promise<void> {
    await hc("set_attr", `clients.${wid}.minimized`, "true");
}

/**
 * Prune an empty focused frame: if the tag has more than one frame and
 * the FOCUSED frame holds zero clients, remove it. Checks the focused
 * frame (not the window's parent_frame) because minimized windows lose
 * their parent_frame attribute.
 *
 * Counts are read through herbstutil's parseAttr (attrValue) — the
 * typed leaf read; the defaults match the raw-read fallbacks
 * (unreadable frame_count behaves as 1, unreadable client_count as 1).
 */
export async function removeEmptyFrame(): Promise<void> {
    const frameCount = (await attrValue<number>("tags.focus.frame_count")) ?? 1;
    if (frameCount <= 1) return;
    const clients = (await attrValue<number>(
        "tags.focus.tiling.focused_frame.client_count")) ?? 1;
    if (clients < 1) {
        await hc("remove");
    }
}

/**
 * The reload composition: `herbstclient reload` (kills the bar daemons
 * — polyframes restarts with polybar), plus `reload_theme --force` when
 * the helper is found in the dots helper dir (hc.ts helperDir() — the
 * same place hc_center resolves from). The theme reload runs after the
 * WM reload so the fresh session picks up the theme, not the stale one.
 * Fail-soft: a missing helper or a failed reload resolves false — the
 * verb exits 1 (navCommand), the keybind never wedges.
 */
export async function reload(): Promise<boolean> {
    const themeOk = await helper("reload_theme", ["--force"]);
    const hcOk = await hc("reload") !== null;
    return hcOk && themeOk;
}
