// src/lib/chains.ts — the pure keybind chains: single chained
// `herbstclient` spawns, the chains ARE the bindings, verbatim from
// the keys.d fragments (~/dots/herbstluftwm/.config/herbstluftwm/
// keys.d/{focus,nav}.sh + the autostart, and
// ~/dots/herbstluftwm/.config/herbstluftwm/keys.d/floating.sh).
//
// Fail-soft (the dots wrapper convention) via the spawn layer in
// src/lib/hc.ts — a failed call resolves null instead of throwing.
//
// The CLI verbs that expose these live in src/commands/*.ts (one bunli
// command module per verb), via the navCommand factory in
// src/lib/nav-command.ts.

import { attrTree, attrValue, hc } from "./hc.js";
import { hiddenMenu } from "./hidden.js";

/** $Mod-s (focus.sh) — the zoom/peek grid: urgent jumpto, frame-down
 *  focus, the floating-layer branch (attr floating_focused true both
 *  focuses the floating layer AND fails through when it is empty), the
 *  cycle fallbacks and the pseudotile toggle. One chained spawn, held
 *  under lock. */
export async function getSouth(): Promise<void> {
    await hc(
        "chain", ":", "lock",
        ":", "or",
        ",", "and", ".", "compare", "tags.focus.urgent_count", "gt", "0", ".", "jumpto", "urgent",
        ",", "focus", "--level=frame", "down",
        ",", "and",
        ".", "attr", "tags.focus.floating_focused", "true",
        ".", "attr", "tags.focus.focused_client.floating", "off",
        ".", "attr", "tags.focus.focused_client.pseudotile", "off",
        ",", "and",
        "!", "compare", "tags.focus.curframe_wcount", "gt", "1",
        "!", "cycle", "-1",
        "!", "attr", "clients.focus.pseudotile", "off",
        ",", "pseudotile", "toggle",
        ":", "unlock",
    );
}

/** $Mod-w (re-adopted 2026-11-28): the PRIME implementation of jump
 *  forward, verbatim — the layered priority chain: leave the floating
 *  layer first, then intra-frame cycle +1 when the frame holds >1
 *  client, then inter-frame navigation (focus --level=frame up), and
 *  the bare cycle_frame fallback last. Focus-only — never modifies
 *  the layout (the layout-movers stay on $ModShift-*). */
export async function getForward(): Promise<void> {
    await hc(
        "chain", ":", "lock", ":", "or",
        ",", "and",
        "!", "compare", "tags.focus.floating_focused", "=", "1",
        "!", "attr", "tags.focus.floating_focused", "off",
        ",", "and",
        "!", "compare", "tags.focus.curframe_wcount", "gt", "1",
        "!", "cycle", "+1",
        ",", "focus", "--level=frame", "up",
        ",", "cycle_frame",
        ":", "unlock",
    );
}

/** $Mod-e (2026-11-28): the OVERLOADED explode — explodeFrame's PRIME
 *  implementation is performed on non-max frames; otherwise frame
 *  cycling (traversal, cycle_frame -1) is performed. Focus-only. */
export async function jumpBackward(): Promise<void> {
    const algorithm = await attrValue("tags.focus.tiling.focused_frame.algorithm");
    if (algorithm !== "max") {
        await explodeFrame();
        return;
    }
    await hc("cycle_frame", "-1");
}

/** $Mod-d (nav.sh): the layout cycler — count-gated cycle_layout mixes
 *  (4+ windows, exactly 2) with a bare -1 rotation fallback. */
export async function getDeck(): Promise<void> {
    await hc(
        "or",
        ",", "and",
        ".", "compare", "tags.focus.curframe_wcount", "gt", "3",
        ".", "cycle_layout", "+1", "max", "vertical", "grid", "horizontal",
        ",", "and",
        ".", "compare", "tags.focus.curframe_wcount", "=", "2",
        ".", "cycle_layout", "+1", "vertical", "max", "horizontal",
        ",", "cycle_layout", "-1", "vertical", "horizontal", "max",
    );
}

/** $ModShift-d (nav.sh): with >1 window in the focused frame mix in
 *  the max/grid/vertical layouts, otherwise remove the focused frame
 *  (the shift-complement of $Mod-d's cycler). */
export async function getDedeck(): Promise<void> {
    await hc(
        "or",
        ".", "and",
        ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
        ",", "cycle_layout", "+1", "max", "grid", "vertical",
        ".", "remove",
    );
}

/** $Mod-e (focus.sh): with >1 frame cycle backwards, else explode the
 *  frame and cycle forward. */
export async function explodeFrame(): Promise<void> {
    await hc(
        "or", ".",
        "and", ",", "compare", "tags.focus.frame_count", "gt", "1", ",", "cycle_frame", "-1",
        ".", "chain", "!", "split", "explode", "!", "cycle_frame",
    );
}

/** $Mod-s (2026-11-28): the corrected invariant of the jump BACKWARD
 *  machine with the inverted preference — it PREFERS cycle over
 *  cycle_frame when the layout root has a single child or the focused
 *  frame's algorithm is "max" (the backward layered machine runs:
 *  intra-frame cycle -1 first, cycle_frame +1 fallback); with multiple
 *  root children on a non-max frame it PREFERS cycle_frame over cycle
 *  (cycle_frame +1 traversal first, cycle -1 fallback). */
export async function southExplode(): Promise<void> {
    const root = await attrTree("tags.focus.tiling.root");
    const children = root ? root.children.length : 1;
    const algorithm = await attrValue("tags.focus.tiling.focused_frame.algorithm");
    if (children === 1 || algorithm === "max") {
        await jumpBackwardLayered();
        return;
    }
    await hc(
        "or",
        ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame", "+1",
        ",", "cycle", "-1",
    );
}

/** the backward layered machine (cycle preferred over cycle_frame):
 *  intra-frame cycle -1 when the frame holds >1 client, the
 *  cycle_frame +1 fallback at the edge. */
async function jumpBackwardLayered(): Promise<void> {
    await hc(
        "chain", ":", "lock", ":", "or",
        ",", "and",
        "!", "compare", "tags.focus.floating_focused", "=", "1",
        "!", "attr", "tags.focus.floating_focused", "off",
        ",", "and",
        "!", "compare", "tags.focus.curframe_wcount", "gt", "1",
        "!", "cycle", "-1",
        ",", "cycle_frame", "+1",
        ":", "unlock",
    );
}

/** $Mod-a (autostart): focus the frame to the left, or split one off
 *  at a third of the width when there is nothing to focus. */
export async function focusFrameLeft(): Promise<void> {
    await hc(
        "or",
        ",", "focus", "left", "--level=frame",
        ",", "split", "left", "0.33333",
    );
}

/** $ModShift-w (nav.sh): shift-up — the shift-up ladder. First
 *  tries shifting the window up into the frame above (--level=all);
 *  when there is nothing above, with >1 window in the focused frame it
 *  cycles -1, otherwise it tries cycle_frame, then falls through to
 *  rotating the frame tree. */
export async function shiftUp(): Promise<void> {
    await hc(
        "or",
        ",", "shift", "--level=all", "up",
        ",", "or",
        "!", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
        "!", "cycle", "-1",
        ",", "chain", "!", "lock", "!", "rotate", "!", "unlock",
    );
}

/** $ModCtrl-r + $ModCtrl-c (autostart): rotate. Three modes:
 *  auto (default, $ModCtrl-r) — the rotate/skip condition: rotate the
 *    tree when <3 frames, otherwise the focus fallback (cycle_frame
 *    forward when >1 frame, cycle windows on a single frame).
 *  focus (--focus) — force the focus/skip branch: never rotate, the
 *    forward cycle fallback unconditionally.
 *  smart (--smart[=N], $ModCtrl-c) — the reversed condition: rotate
 *    when frame_count >= N (default 3 — the exact complement of the
 *    auto rotate threshold), cycle BACKWARDS below it (frames when
 *    >1, windows on a single frame). */
export type RotateTreeMode = "auto" | "focus" | "smart";

export async function rotateTree(mode: RotateTreeMode = "auto", threshold = 3): Promise<boolean> {
    if (mode === "smart") {
        await hc(
            "or",
            ",", "and", ".", "compare", "tags.focus.frame_count", "ge", String(threshold),
            ".", "chain", "!", "lock", "!", "rotate", "!", "unlock",
            ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame", "-1",
            ",", "cycle", "-1",
        );
        return true;
    }
    if (mode === "focus") {
        await hc(
            "or",
            ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
            ",", "cycle", "+1",
        );
        return true;
    }
    await hc(
        "or",
        ",", "and", ".", "compare", "tags.focus.frame_count", "lt", "3",
        ".", "chain", "!", "lock", "!", "rotate", "!", "unlock",
        ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
        ",", "cycle", "+1",
    );
    return true;
}

/** $ModShift-b (autostart): the --shift machine of frame down AND
 *  frame bottom — with >1 window in the focused frame, split a bottom
 *  frame and shift the window down into it. */
export async function splitDown(): Promise<void> {
    await hc(
        "or", ".",
        "and", ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
        ",", "chain", "!", "split", "bottom", "!", "shift", "down",
    );
}

/** frame left --shift: with >1 window in the focused frame, split a
 *  left frame and shift the window left into it. */
export async function splitLeftShift(): Promise<void> {
    await hc(
        "or", ".",
        "and", ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
        ",", "chain", "!", "split", "left", "!", "shift", "left",
    );
}

/** frame right --shift: with >1 window in the focused frame, split a
 *  right frame and shift the window right into it. */
export async function splitRightShift(): Promise<void> {
    await hc(
        "or", ".",
        "and", ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
        ",", "chain", "!", "split", "right", "!", "shift", "right",
    );
}

/** $ModShift-s (nav.sh): shift-down — an empty focused frame is removed;
 *  a multi-window frame shifts the window down, splitting a bottom
 *  frame first when there is nothing below. A lone-window frame in a
 *  multi-frame tag deliberately does NOTHING (the neither-branch). */
export async function shiftDown(): Promise<void> {
    await hc(
        "or",
        ",", "and", ".", "compare", "tags.focus.curframe_wcount", "=", "0",
        ".", "remove",
        ",", "and", ".", "compare", "tags.focus.curframe_wcount", "gt", "1",
        ".", "or",
        ",", "shift", "down",
        ",", "chain", "!", "split", "bottom", "!", "shift", "down",
    );
}

/** $ModCtrl-a (autostart): shift-left — shift the window left; with
 *  nothing to the left focus the frame left, else split left and shift
 *  the window into the new frame. */
export async function shiftLeft(): Promise<void> {
    await hc(
        "or",
        ",", "shift", "left",
        ",", "focus", "left", "--level=frame",
        ",", "chain", ".", "split", "left", ".", "shift", "left",
    );
}

/** $ModCtrl-e (autostart): shift-right — shift the window right, else
 *  split right and focus the new frame right. */
export async function shiftRight(): Promise<void> {
    await hc(
        "or",
        ",", "shift", "right",
        ",", "chain", ".", "split", "right", ".", "focus", "--level=frame", "right",
    );
}

/** $ModShift-t (autostart): new-frame — the FRAME LOGIC ONLY of the
 *  open-a-second-frame binding: split auto + cycle_frame ONLY when the
 *  focused frame holds >0 windows; an empty frame stays as is (the
 *  terminal then opens into it). The `spawn $TERMINAL` half of the
 *  binding stays a dotfiles concern — the dots keybind chains this
 *  with the spawn (herbctl never spawns terminals). */
export async function newFrame(): Promise<void> {
    await hc(
        "chain",
        ",", "or",
        ":", "and", ".", "compare", "tags.focus.curframe_wcount", "gt", "0",
        ".", "chain", "!", "split", "auto", "!", "cycle_frame",
        ":",
        "true",
    );
}

/** $ModShift-q (autostart): close-or-remove — a focused float is closed and
 *  its frame removed; otherwise close_or_remove (close, and remove the
 *  frame when it is left empty). */
export async function closeOrRemove(): Promise<void> {
    await hc(
        "or",
        ",", "and", ".", "compare", "clients.focus.floating", "=", "true",
        ".", "close",
        ",", "remove",
        ",", "close_or_remove",
    );
}

/** $ModCtrl-q (autostart): xkill-or-close — the xkill-or-close chain: a
 *  focused client exists -> spawn xkill (targeted kill), else
 *  close_and_remove. */
export async function xkillOrClose(): Promise<void> {
    await hc(
        "or",
        ".", "and",
        ",", "attr", "clients.focus",
        ",", "spawn", "xkill",
        ".", "close_and_remove",
    );
}

/** $Mod-v (autostart): split-right-cycle — split right at half and cycle into
 *  the new frame. */
export async function splitRightCycle(): Promise<void> {
    await hc(
        "chain",
        ",", "split", "right", "0.5",
        ",", "cycle_frame",
    );
}

/** $Mod-b (autostart): focus-frame-down — focus the frame down, else split a
 *  bottom frame at half and cycle into it. */
export async function focusFrameDown(): Promise<void> {
    await hc(
        "or",
        "!", "focus", "--level=frame", "down",
        "!", "chain", ",", "split", "bottom", "0.5", ",", "cycle_frame",
    );
}

/** $ModCtrl-v (autostart): split-right-focus — split right at half and focus
 *  into the new frame (-e: exploding focus). */
export async function splitRightFocus(): Promise<void> {
    await hc(
        "chain",
        ",", "split", "right", "0.5",
        ",", "focus", "-e", "right",
    );
}

/** $ModCtrl-b (autostart): split-bottom-focus — split bottom at half and focus
 *  into the new frame (-i: insertion focus). */
export async function splitBottomFocus(): Promise<void> {
    await hc(
        "chain",
        ",", "split", "bottom", "0.5",
        ",", "focus", "-i", "down",
    );
}

/** $Mod-q (floating.sh): close-window — a focused float is ONLY
 *  un-floated; tiling windows get closed, with a lone-window frame
 *  removed afterwards (close_and_remove / close_or_remove). Under
 *  lock. */
export async function closeWindow(): Promise<void> {
    await hc(
        "chain", "!", "lock",
        "!", "or",
        ".", "and", ",", "compare", "tags.focus.floating_focused", "=", "true",
        ",", "close",
        ".", "and", ",", "compare", "tags.focus.curframe_wcount", "=", "1",
        ",", "close_and_remove",
        ".", "close_or_remove",
        "!", "unlock",
    );
}

/** $ModShift-f (floating.sh): fullscreen-toggle — fullscreen toggle on the
 *  focused client. */
export async function fullscreenToggle(): Promise<void> {
    await hc("attr", "clients.focus.fullscreen", "toggle");
}

/** $ModShift-z (nav.sh): minimize-toggle — minimized toggle on the focused
 *  client. */
export async function minimizeToggle(): Promise<void> {
    await hc("attr", "clients.focus.minimized", "toggle");
}

// ── the tagspace cycler (the hc_tag-cycle reference implementation) ──
//
// Ported faithfully from ~/dots/herbstluftwm/.local/bin/hc_tag-cycle:
// tag cycling that SKIPS EMPTY tags (the plain `use_index ±1
// --skip-visible` on the brackets walks EVERY tag in order, empty ones
// included). The walker reads the population/visibility facts from ONE
// `herbstclient tag_status` read (per-tag char + name, in index order):
//
//   .  unoccupied            -> skipped
//   :  occupied, not visible -> candidate
//   *  occupied, visible on another monitor -> skipped (keeps the old
//      --skip-visible semantics: a visible tag is never stolen from
//      its monitor)
//   #  focused tag           -> the starting point, never a target
//   !  urgent tag            -> candidate
//
// When no other populated tag exists (or the WM is unreachable) the
// walker STAYS PUT (the script's exit-0-and-stay).

/** One `herbstclient tag_status` record: the status char plus the tag
 *  name, in index order. */
export interface TagStatusEntry {
    char: string;
    name: string;
}

/** `herbstclient tag_status` parsed: one record per tag, index order
 *  (the script's tab-split — the leading tab and the trailing newline
 *  are stripped, the FIRST character of each entry is the status
 *  char). Resolves null when the WM is unreachable (fail-soft). */
export async function tagStatus(): Promise<TagStatusEntry[] | null> {
    const r = await hc("tag_status");
    if (r === null) return null;
    return r.stdout.trim().split("\t").filter((e) => e !== "").map((e) => ({
        char: e.charAt(0),
        name: e.slice(1),
    }));
}

/**
 * Walk the tag ring in the requested direction and land on the next
 * POPULATED tag (`use <name>`). Resolves the entered tag name, or null
 * when it stayed put (no other populated tag / WM unreachable).
 */
export async function tagCycle(dir: -1 | 1): Promise<string | null> {
    const entries = await tagStatus();
    if (entries === null || entries.length === 0) return null;
    const n = entries.length;
    const cur = await attrValue<number>("tags.focus.index");
    if (cur === null) return null;
    for (let s = 1; s < n; s++) {
        const i = (((cur + dir * s) % n) + n) % n;
        const e = entries[i];
        if (e.char === ":" || e.char === "!") {
            return (await hc("use", e.name)) !== null ? e.name : null;
        }
    }
    return null; // no populated tag besides the current one — stay
}

/** $Mod-bracketleft (autostart): the previous populated tag. */
export async function jumpPrev(): Promise<void> {
    await tagCycle(-1);
}

/** $Mod-bracketright (autostart): the next populated tag. */
export async function jumpNext(): Promise<void> {
    await tagCycle(1);
}

/** $ModCtrl-d (autostart): minimize — minimize the focused client; on an
 *  EMPTY focused frame hand off to the mod-g machine (the hidden picker,
 *  lib/hidden.ts: no hidden clients -> the all-but-focused windows
 *  switcher, exactly one hidden client -> reveal it directly, more ->
 *  the hidden-windows menu). */
export async function minimizeOrPicker(): Promise<void> {
    const wid = (await attrValue<string>("clients.focus.winid")) ?? "";
    if (wid === "") {
        await hiddenMenu(); // never returns on the menu branches (rofi exec)
        return;
    }
    await hc("set_attr", `clients.${wid}.minimized`, "true");
}
