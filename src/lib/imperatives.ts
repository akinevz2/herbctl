// src/lib/imperatives.ts — the small imperative compositions shared by
// the state machines below (ports of the hc_floatx / scrollFocus
// building blocks; polyframes composes the same steps inline).
//
// Fail-soft everywhere (the dots wrapper convention): a failed
// herbstclient call resolves null instead of throwing.

import { attr, attrRaw, attrValue, helper, hc, listClientsByTag } from "./hc.js";

/**
 * The un-float chain shared by the float machines: fold the
 * fullscreen/pseudotile flags and write floating to `state` (off = the
 * un-float register, on = the companion-float yank). Fail-soft —
 * the source scripts wrap these in `2>/dev/null || true`.
 */
export async function floatFlagsChain(wid: string, state: "on" | "off"): Promise<void> {
    await hc(
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, state,
    );
}

/**
 * Pre-scan the first VISIBLE (non-minimized) float on the focused
 * tag — the only candidate the floating layer can focus (the
 * hc_focus / hc_floatx first_float; clients.focus settles late after
 * a layer switch, so the machines resolve this UP FRONT). Returns ""
 * when the tag is unreadable or no visible float exists.
 */
export async function firstVisibleFloat(tag: string): Promise<string> {
    if (!tag) return "";
    for (const c of await listClientsByTag(tag)) {
        const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
        if (floating === "true") {
            const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
            if (minimized === "false") return c;
        }
    }
    return "";
}

/**
 * un-float a float by wid and focus it (hc_floatx's unfloat_wid): fold
 * the fullscreen/pseudotile flags, floating off, then jumpto. The
 * chain is intentionally fail-soft (2>/dev/null || true in the
 * source).
 */
export async function unfloatWid(wid: string): Promise<void> {
    await floatFlagsChain(wid, "off");
    await hc("jumpto", wid);
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

// ── the polyframes window machines (migrated 2026-11) ────────────────
// The bar's click semantics call these; the machines themselves are
// WM work and live here. All raw-attr reads (attrRaw) — the same
// string semantics the ported sources used.

/** The center verb as a detached self-spawn (the runHelper shape the
 *  polyframes sources used; `herbctl center` owns the geometry). */
function spawnCenter(args: string[]): void {
    const self = Bun.which("herbctl") ?? process.execPath;
    Bun.spawn([self, "center", ...args],
        { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
}

/**
 * The DISMISS machine (polyframes' middle click; `herbctl minimize
 * --dismiss`): a targeted TOGGLE —
 *   minimized        -> unminimize + float + focus (center-root when
 *                       it was floating before the minimize)
 *   tiling, focused  -> minimize
 *   tiling, unfocused-> minimize + REMOVE the emptied parent frame
 *                       (last-frame guarded) + hand focus back
 *   floating         -> minimize
 */
export async function dismissWindow(wid: string): Promise<void> {
    const min = (await attr(`clients.${wid}.minimized`)) === "true";
    const flt = (await attr(`clients.${wid}.floating`)) === "true";

    if (min) {
        // Unminimize: restore and center
        await hc("set_attr", `clients.${wid}.minimized`, "false");
        await hc("set_attr", `clients.${wid}.floating`, "true");
        if (flt) spawnCenter(["root"]);
        await hc("jumpto", wid);
        return;
    }

    const active = (await attrRaw("clients.focus.winid")) || "";

    // Tiling and focused: simply minimize
    if (flt && wid === active) {
        await hc("set_attr", `clients.${wid}.minimized`, "true");
        return;
    }

    // Tiling and NOT focused: remove the parent frame if it empties
    if (!flt) {
        const frameCount = Number((await attrRaw("tags.focus.frame_count")) ?? "1");
        // Last frame: cannot remove — plain minimize
        if (frameCount <= 1) {
            await hc("set_attr", `clients.${wid}.minimized`, "true");
            return;
        }
        await hc("jumpto", wid);
        const newFrameClients = Number(
            (await attrRaw("tags.focus.curframe_wcount")) ?? "1");
        await hc("set_attr", `clients.${wid}.minimized`, "true");
        try {
            if (newFrameClients <= 1) {
                await hc("lock");
                await hc("remove");
            }
            if (wid !== active) await hc("jumpto", active);
        } finally {
            await hc("unlock");
        }
        return;
    }

    await hc("set_attr", `clients.${wid}.minimized`, "true");
}

/**
 * The FLOAT-TOGGLE cycle machine (polyframes' alt click;
 * `herbctl float --toggle`):
 *   minimized           -> unminimize into its frame (frame holds
 *                           others: re-tile; frame empty: stay float,
 *                           centered at current size)
 *   floating, unfocused -> focus + raise
 *   floating, focused   -> minimize
 *   tiled               -> float + raise
 */
export async function floatToggle(wid: string): Promise<void> {
    await hc("lock");
    try {
        const min = (await attr(`clients.${wid}.minimized`)) === "true";
        const flt = (await attr(`clients.${wid}.floating_effectively`)) === "true";
        const foc = (await attrRaw("clients.focus.winid")) || "";

        if (min) {
            const frame = (await attrRaw(`clients.${wid}.parent_frame.index`)) || "";
            const cc = Number(
                (await attrRaw(`clients.${wid}.parent_frame.client_count`)) ?? "1");
            if (frame !== "" && cc > 1) {
                // frame holds others -> re-tile into it
                await hc("set_attr", `clients.${wid}.floating`, "false");
                await hc("set_attr", `clients.${wid}.minimized`, "false");
                await hc("jumpto", wid);
                await hc("raise", wid);
                return;
            }
            // empty frame -> stay floating, centered at current size
            await hc("set_attr", `clients.${wid}.floating`, "true");
            await hc("set_attr", `clients.${wid}.minimized`, "false");
            spawnCenter(["--wid", wid]);
            await hc("jumpto", wid);
            await hc("raise", wid);
        } else if (flt && wid !== foc) {
            await hc("jumpto", wid);
            await hc("raise", wid);
        } else if (flt) {
            await hc("set_attr", `clients.${wid}.minimized`, "true");
        } else {
            await hc("set_attr", `clients.${wid}.floating`, "true");
            await hc("raise", wid);
        }
    } finally {
        await hc("unlock");
    }
}

/**
 * The GROUP-CYCLE focus step (polyframes' scroll cycle core;
 * `herbctl focus --frame <left|right>`): focus the previous/next
 * member of the window's (frame, class) group — the attr-tree order,
 * wraparound. A single-member group is a no-op. The bar's escalation
 * ladder and switcher branches stay presentation-side.
 */
export async function focusFrameStep(
    wid: string,
    dir: "left" | "right",
): Promise<void> {
    const frame = (await attrRaw(`clients.${wid}.parent_frame.index`)) || "";
    const cls = (await attrRaw(`clients.${wid}.class`)) || "";
    const tag = (await attrRaw(`clients.${wid}.tag`)) || "";
    if (frame === "") return;
    const wids = await listClientsByTag(tag);
    const members: string[] = [];
    for (const w of wids) {
        if (w === wid) { members.push(w); continue; }
        const pf = (await attrRaw(`clients.${w}.parent_frame.index`)) || "";
        if (pf !== frame) continue;
        const c = (await attrRaw(`clients.${w}.class`)) || "";
        if (c !== cls) continue;
        members.push(w);
    }
    if (members.length <= 1) return;
    const pos = members.indexOf(wid);
    const target = dir === "right"
        ? members[(pos + 1) % members.length]
        : members[(pos - 1 + members.length) % members.length];
    if (target && target !== wid) await hc("jumpto", target);
}
