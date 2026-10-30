// src/lib/chains.ts — the pure keybind chains: single chained
// `herbstclient` spawns, the chains ARE the bindings, verbatim from
// the keys.d fragments (~/dots/herbstluftwm/.config/herbstluftwm/
// keys.d/{focus,nav}.sh + the autostart, and
// ~/dots/herbstluftwm/.config/herbstluftwm/keys.d/floating.sh).
//
// Fail-soft (the dots wrapper convention) via the spawn layer in
// src/lib/hc.ts — a failed call resolves null instead of throwing.
//
// The CLI verbs that expose these live in src/commands/get-*.ts
// (bunli command modules, one per verb).

import { defineCommand } from "@bunli/core";

import { hc } from "./hc.js";

/** CLI verb factory: exit 1 when the underlying machine reports
 *  failure (run() returning false), 0 otherwise. */
export function navCommand(name: string, description: string, run: () => Promise<boolean | void>) {
    return defineCommand({
        name: name as never,
        description,
        handler: async () => {
            const ok = await run();
            if (ok === false) process.exit(1);
        },
    });
}

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

/** $Mod-w (nav.sh): leave the floating layer, then cycle window/frame
 *  upward — focus --level=frame up, cycle_frame. */
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
export async function getExplore(): Promise<void> {
    await hc(
        "or", ".",
        "and", ",", "compare", "tags.focus.frame_count", "gt", "1", ",", "cycle_frame", "-1",
        ".", "chain", "!", "split", "explode", "!", "cycle_frame",
    );
}

/** $Mod-a (autostart): focus the frame to the left, or split one off
 *  at a third of the width when there is nothing to focus. */
export async function getAdvice(): Promise<void> {
    await hc(
        "or",
        ",", "focus", "left", "--level=frame",
        ",", "split", "left", "0.33333",
    );
}

/** $ModShift-w (nav.sh): get-shuffle — the shift-up ladder. First
 *  tries shifting the window up into the frame above (--level=all);
 *  when there is nothing above, with >1 window in the focused frame it
 *  cycles -1, otherwise it tries cycle_frame, then falls through to
 *  rotating the frame tree. */
export async function getShuffle(): Promise<void> {
    await hc(
        "or",
        ",", "shift", "--level=all", "up",
        ",", "or",
        "!", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
        "!", "cycle", "-1",
        ",", "chain", "!", "lock", "!", "rotate", "!", "unlock",
    );
}

/** $ModCtrl-r (focus.sh): get-rotate — rotate the tree (<3 frames) or
 *  cycle frames forward; on a single frame it cycles windows in the
 *  opposite direction of get-shuffle. */
export async function getRotate(): Promise<void> {
    await hc(
        "or",
        ",", "and", ".", "compare", "tags.focus.frame_count", "lt", "3",
        ".", "chain", "!", "lock", "!", "rotate", "!", "unlock",
        ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
        ",", "cycle", "+1",
    );
}

/** $ModShift-b (autostart): with >1 window in the focused frame, split
 *  a bottom frame and shift the window down into it. */
export async function getBelow(): Promise<void> {
    await hc(
        "or", ".",
        "and", ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
        ",", "chain", "!", "split", "bottom", "!", "shift", "down",
    );
}

/** $ModShift-s (nav.sh): get-skip — an empty focused frame is removed;
 *  a multi-window frame shifts the window down, splitting a bottom
 *  frame first when there is nothing below. A lone-window frame in a
 *  multi-frame tag deliberately does NOTHING (the neither-branch). */
export async function getSkip(): Promise<void> {
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

/** $ModCtrl-a (autostart): get-dive — shift the window left; with
 *  nothing to the left focus the frame left, else split left and shift
 *  the window into the new frame. */
export async function getDive(): Promise<void> {
    await hc(
        "or",
        ",", "shift", "left",
        ",", "focus", "left", "--level=frame",
        ",", "chain", ".", "split", "left", ".", "shift", "left",
    );
}

/** $ModCtrl-e (autostart): get-toss — shift the window right, else
 *  split right and focus the new frame right. */
export async function getToss(): Promise<void> {
    await hc(
        "or",
        ",", "shift", "right",
        ",", "chain", ".", "split", "right", ".", "focus", "--level=frame", "right",
    );
}

/** $ModShift-t (autostart): get-tuck — the FRAME LOGIC ONLY of the
 *  open-a-second-frame binding: split auto + cycle_frame ONLY when the
 *  focused frame holds >0 windows; an empty frame stays as is (the
 *  terminal then opens into it). The `spawn $TERMINAL` half of the
 *  binding stays a dotfiles concern — the dots keybind chains this
 *  with the spawn (herbctl never spawns terminals). */
export async function getTuck(): Promise<void> {
    await hc(
        "chain",
        ",", "or",
        ":", "and", ".", "compare", "tags.focus.curframe_wcount", "gt", "0",
        ".", "chain", "!", "split", "auto", "!", "cycle_frame",
        ":",
        "true",
    );
}

/** $ModShift-q (autostart): get-hold — a focused float is closed and
 *  its frame removed; otherwise close_or_remove (close, and remove the
 *  frame when it is left empty). */
export async function getHold(): Promise<void> {
    await hc(
        "or",
        ",", "and", ".", "compare", "clients.focus.floating", "=", "true",
        ".", "close",
        ",", "remove",
        ",", "close_or_remove",
    );
}

/** $ModCtrl-q (autostart): get-wrench — the xkill-or-close chain: a
 *  focused client exists -> spawn xkill (targeted kill), else
 *  close_and_remove. */
export async function getWrench(): Promise<void> {
    await hc(
        "or",
        ".", "and",
        ",", "attr", "clients.focus",
        ",", "spawn", "xkill",
        ".", "close_and_remove",
    );
}

/** $Mod-v (autostart): get-vex — split right at half and cycle into
 *  the new frame. */
export async function getVex(): Promise<void> {
    await hc(
        "chain",
        ",", "split", "right", "0.5",
        ",", "cycle_frame",
    );
}

/** $Mod-b (autostart): get-bend — focus the frame down, else split a
 *  bottom frame at half and cycle into it. */
export async function getBend(): Promise<void> {
    await hc(
        "or",
        "!", "focus", "--level=frame", "down",
        "!", "chain", ",", "split", "bottom", "0.5", ",", "cycle_frame",
    );
}

/** $ModCtrl-v (autostart): get-vexi — split right at half and focus
 *  into the new frame (-e: exploding focus). */
export async function getVexi(): Promise<void> {
    await hc(
        "chain",
        ",", "split", "right", "0.5",
        ",", "focus", "-e", "right",
    );
}

/** $ModCtrl-b (autostart): get-bendi — split bottom at half and focus
 *  into the new frame (-i: insertion focus). */
export async function getBendi(): Promise<void> {
    await hc(
        "chain",
        ",", "split", "bottom", "0.5",
        ",", "focus", "-i", "down",
    );
}

/** $Mod-q (floating.sh): get-quiet — a focused float is ONLY
 *  un-floated; tiling windows get closed, with a lone-window frame
 *  removed afterwards (close_and_remove / close_or_remove). Under
 *  lock. */
export async function getQuiet(): Promise<void> {
    await hc(
        "chain", "!", "lock",
        "!", "or",
        ".", "and", ",", "compare", "tags.focus.floating_focused", "=", "true",
        ",", "attr", "clients.focus.floating", "off",
        ".", "and", ",", "compare", "tags.focus.curframe_wcount", "=", "1",
        ",", "close_and_remove",
        ".", "close_or_remove",
        "!", "unlock",
    );
}

/** $ModShift-f (floating.sh): get-hush — fullscreen toggle on the
 *  focused client. */
export async function getHush(): Promise<void> {
    await hc("attr", "clients.focus.fullscreen", "toggle");
}

/** $ModShift-z (nav.sh): get-nap — minimized toggle on the focused
 *  client. */
export async function getNap(): Promise<void> {
    await hc("attr", "clients.focus.minimized", "toggle");
}
