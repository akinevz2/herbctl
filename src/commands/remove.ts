// src/commands/remove.ts — THE REMOVAL SURFACE (renamed from `close`):
//
//   herbctl remove                  the or-remove machine (a focused
//                                   float closes + the lone frame is
//                                   removed; else close_or_remove —
//                                   $ModShift-q's original)
//   remove --tiling                 ONLY the tiling layer: the focused
//                                   FRAME's window closes, floats
//                                   untouched ($ModShift-q)
//   remove --frame                  the LAYERED removal:
//                                     a floating window -> close it
//                                     the frame empty   -> remove the frame
//                                     the frame holds windows
//                                                       -> close the frame's window
//                                     the frame AND the tag empty
//                                                       -> use_previous
//                                                        + remove the tag
//   remove --tag NAME               close the tag NAME (its clients
//                                   move to the first other tag)
//   remove --cleanup                remove ALL empty tags
//
// THE ORCHESTRATOR GUARD: every machine refuses when the focused
// window IS the orchestrator. The machines live in lib/chains.ts /
// lib/allocate.ts — remove is only the dispatch surface.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { closeOrRemove } from "../lib/chains.js";
import { attr, hc } from "../lib/hc.js";
import { closeEmptyTags, freeTag } from "../lib/allocate.js";
import { isOrchestrator } from "../lib/track.js";

async function closeTiling(): Promise<void> {
    const ff = (await attr("tags.focus.floating_focused")) ?? "false";
    if (ff === "true") return; // a float has focus: untouched
    const wid = (await attr("clients.focus.winid")) ?? "";
    if (wid === "") return; // nothing focused: fail soft
    await hc("close");
}

/** --frame: the LAYERED removal (the frame/tag-aware collapse). */
async function removeLayered(): Promise<void> {
    const ff = (await attr("tags.focus.floating_focused")) ?? "false";
    const wid = (await attr("clients.focus.winid")) ?? "";
    if (ff === "true" && wid !== "") {
        // a FLOATING window: close it
        await hc("close", wid);
        return;
    }
    const wcount = (await attr("tags.focus.curframe_wcount")) ?? "0";
    if (wcount !== "0") {
        // the frame holds windows: close the frame's window
        await closeTiling();
        return;
    }
    const clients = (await attr("tags.focus.client_count")) ?? "0";
    if (clients === "0") {
        // the frame AND the tag are empty: use_previous + remove the
        // tag (its name is read BEFORE the view moves)
        const tag = (await attr("tags.focus.name")) ?? "";
        await hc("use_previous");
        if (tag !== "") await freeTag(tag);
        return;
    }
    // the frame is empty, the tag holds clients elsewhere: remove the
    // frame
    await hc("remove");
}

export default defineCommand({
    name: "remove" as never,
    description: "remove selected object if empty",
    options: {
        tiling: option(z.boolean().default(false), {
            description: "the focused FRAME's window only (floats untouched)",
            short: "t",
            argumentKind: "flag",
        }),
        frame: option(z.boolean().default(false), {
            description: "the layered removal: float closes / empty frame removes / frame's window closes / empty tag: use_previous + tag removed",
            short: "F",
            argumentKind: "flag",
        }),
        tag: option(z.string().optional(), {
            description: "close the tag NAME (its clients move to the first other tag)",
            short: "a",
        }),
        cleanup: option(z.boolean().default(false), {
            description: "remove ALL empty tags",
            short: "c",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags, positional }) => {
        // THE ORCHESTRATOR GUARD: the focused window being the
        // orchestrator refuses EVERY removal machine (before any
        // runs) — tag/cleanup removals are unaffected (they remove
        // no window)
        if (!flags.tag && !flags.cleanup) {
            const focused = (await attr("clients.focus.winid")) ?? "";
            if (await isOrchestrator(focused)) {
                throw new Error(
                    "remove: the ORCHESTRATOR holds focus — refusing "
                    + "(focus the target first)",
                );
            }
        }
        if (flags.cleanup) {
            const closed = await closeEmptyTags();
            console.log(closed.length > 0
                ? `removed the empty tags: ${closed.join(" ")}`
                : "no empty tags to remove");
            return;
        }
        if (flags.tag !== undefined) {
            await freeTag(flags.tag);
            return;
        }
        if (flags.frame) {
            await removeLayered();
            return;
        }
        if (flags.tiling) {
            await closeTiling();
            return;
        }
        await closeOrRemove();
    },
});
