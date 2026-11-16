// src/lib/expand.ts — expand: grow the focused frame's split to the
// maximum ratio; when it is ALREADY at the maximum, remove the
// adjacent empty split (the sibling subtree with no clients), the
// collapse complement.
//
// The frame tree lives under tags.focus.tiling.root — split nodes
// carry the split_type/fraction/selection attributes (fraction is the
// FIRST child's share), leaves carry client_count. Walking down each
// split's selection lands on the focused frame; its parent split is
// the last split on the walk.
//
// Expanding the focused frame means maxing ITS share of the parent
// split: child 0 owns the fraction (→ 0.95), child 1 owns the
// complement (→ 0.05). "Already at maximum" is detected by the
// read-back: a set_attr that leaves the fraction untouched means the
// clamp ate it (or it was already there) — the collapse branch runs.
//
// The collapse is a frame_focus to the adjacent (nearest, directly
// adjacent by construction) frame in the split direction + `remove`
// — hlwm moves the removed frame's windows to the parent and collapses
// a parent left with one child, so the focused frame's layout
// survives. Empty sibling SUBTREES (nested splits of empty leaves)
// collapse one level per iteration; the loop re-walks the tree each
// round and stops when the sibling is non-empty or the split is gone.
// Guarded at 6 rounds — deeper empty nests are not a real layout.

import { attrTree, asString, hc, num, setAttr } from "./hc.js";

/** The fraction extremes hlwm clamps set_attr to (its native bounds). */
const FRACTION_MAX = 0.95;
const FRACTION_MIN = 0.05;

interface SplitState {
    /** object path of the parent split node */
    path: string;
    /** split direction (horizontal | vertical) */
    splitType: string;
    /** the parent's current fraction (the FIRST child's share) */
    fraction: number;
    /** index of the focused child (0 | 1) */
    focusedIndex: number;
}

/** Split-node test: split nodes carry split_type, leaves do not. */
function isSplit(attrs: Record<string, unknown>): boolean {
    return attrs.split_type !== undefined;
}

/** Empty-subtree test: leaves read client_count, splits recurse. */
async function subtreeEmpty(path: string): Promise<boolean> {
    const node = await attrTree(path);
    if (!node) return false; // unknown → treat as non-empty (fail-soft)
    if (isSplit(node.attributes)) {
        for (const child of node.children) {
            if (!(await subtreeEmpty(`${path}.${child}`))) return false;
        }
        return true;
    }
    return num(node.attributes.client_count, 1) === 0;
}

/** Walk down each split's selection to the focused leaf, collecting
 *  the splits on the way. Resolves null when the WM is unreachable or
 *  the shape is unexpected (fail-soft). */
async function walkToFocus(): Promise<SplitState[]> {
    const splits: SplitState[] = [];
    let path = "tags.focus.tiling.root";
    for (let depth = 0; depth < 16; depth++) {
        const node = await attrTree(path);
        if (!node) return [];
        if (!isSplit(node.attributes)) return splits; // the focused leaf
        splits.push({
            path,
            splitType: asString(node.attributes.split_type) ?? "horizontal",
            fraction: num(node.attributes.fraction, 0.5),
            focusedIndex: num(node.attributes.selection, 0),
        });
        path = `${path}.${num(node.attributes.selection, 0)}`;
    }
    return []; // pathological depth — treat as unusable
}

/** hlwm direction that reaches the adjacent frame of a split child. */
function adjacentDirection(splitType: string, childIndex: number): string {
    if (splitType === "vertical") return childIndex === 0 ? "down" : "up";
    return childIndex === 0 ? "right" : "left";
}

export async function expandSplit(): Promise<boolean> {
    // Hold the WM lock across the whole machine (the zoom convention):
    // the fraction set and the focus+remove collapse must not interleave.
    if (!(await hc("lock"))) return false;
    try {
        for (let round = 0; round < 6; round++) {
            const splits = await walkToFocus();
            if (splits.length === 0) {
                // no split at all: a no-op on a fresh call, success
                // when a previous round just collapsed the last split
                return round > 0;
            }
            const parent = splits[splits.length - 1];
            const target = parent.focusedIndex === 0 ? FRACTION_MAX : FRACTION_MIN;

            const before = parent.fraction;
            await setAttr(`${parent.path}.fraction`, String(target));
            // get_attr (not a bare attr re-read): the walk already read
            // this node, and the test harness matches by argv — a
            // distinct command keeps the two reads distinguishable.
            const after = num(
                (await hc("get_attr", `${parent.path}.fraction`))?.stdout.trim(),
                before,
            );

            // "Already at maximum" = the set was a no-op: hlwm clamped
            // it (or it sat at the extreme already) — either way the
            // fraction cannot move further, so collapse.
            const maxed = Math.abs(after - before) < 1e-9;
            if (!maxed) return true; // the expansion did the job

            // already at the maximum → collapse the adjacent empty split
            const siblingIndex = parent.focusedIndex === 0 ? 1 : 0;
            const siblingPath = `${parent.path}.${siblingIndex}`;
            if (!(await subtreeEmpty(siblingPath))) return true; // sibling has clients — nothing to remove
            await hc("frame_focus", adjacentDirection(parent.splitType, parent.focusedIndex));
            await hc("remove");
            // loop re-walks: a nested empty sibling collapses one level per round
        }
        return true;
    } finally {
        await hc("unlock");
    }
}
