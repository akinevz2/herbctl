// src/commands/close.ts — the close-family collapsed into one verb
// with a mode argument (was: close-or-remove / close-window /
// close-tiling / xkill-or-close as four bare verbs):
//
//   herbctl close <or-remove|window|tiling|xkill>
//
//   or-remove  a focused float is closed + frame removed; else
//              close_or_remove ($ModShift-q's original machine)
//   window     a focused float is ONLY un-floated; a tiling window is
//              closed, lone-window frame removed ($Mod-q)
//   tiling     close ONLY on the tiling layer; floats untouched
//              ($ModShift-q)
//   xkill      a focused client -> targeted xkill; else
//              close_and_remove ($ModCtrl-q chain)
//
// The machines live in lib/chains.ts (or the inline bodies below) —
// close is only the dispatch surface.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import {
    closeOrRemove,
    closeWindow,
    xkillOrClose,
} from "../lib/chains.js";
import { attr, hc } from "../lib/hc.js";
import { argFailReason, promptValue } from "../lib/args.js";
import { closeEmptyTagspaces, closeFrame, dismissNotifications, freeTagspace } from "../lib/allocate.js";

async function closeTiling(): Promise<void> {
    const ff = (await attr("tags.focus.floating_focused")) ?? "false";
    if (ff === "true") return; // a float has focus: untouched
    const wid = (await attr("clients.focus.winid")) ?? "";
    if (wid === "") return; // nothing focused: fail soft
    await hc("close");
}

const MACHINES = {
    "or-remove": closeOrRemove,
    window: closeWindow,
    tiling: closeTiling,
    xkill: xkillOrClose,
    // the object-surface modes (the new/add counterpart — close over
    // the same frame/tagspace/notification objects)
    frame: closeFrame,
    tagspace: async () => {
        // the DECLARATIVE argument: source = the live tagspaces
        // (herbstutil-indexed), blank = the focused one — the prompt
        // lists them with "(focused)" first; refused → the fail shape
        const name = positionalTag() ??
            await promptValue(
                {
                    name: "name",
                    description: "the tagspace to free",
                    source: "tagspaces",
                    blank: "current",
                    promptTitle: "tagspace to free",
                },
                "close tagspace",
            )
        if (name === null) {
            console.error(argFailReason("name", "close tagspace"));
            process.exit(2);
        }
        await freeTagspace(name);
    },
    notification: dismissNotifications,
} as const;

/** the tagspace name may ride as the second positional (close
 *  tagspace <name> — default: the focused one) */
function positionalTag(): string | undefined {
    const a = process.argv.slice(2);
    const i = a.indexOf("tagspace");
    const n = a[i + 1];
    return n && !n.startsWith("-") ? n : undefined;
}

export default defineCommand({
    name: "close" as never,
    description:
        "close <or-remove|window|tiling|xkill|frame|tagspace|notification>",
    options: {
        empty: option(z.boolean().optional(), {
            argumentKind: "flag" as const,
            description: "with tagspace: free EVERY empty tagspace at once",
            short: "e",
        }),
    },
    handler: async ({ flags, positional }) => {
        // bunli leaves post-positional flags in the positional tail —
        // sweep them out and honour them either way
        const swept = positional.filter((p) => p !== "--empty" && p !== "-e");
        const wantsEmpty = flags.empty === true
            || swept.length !== positional.length;
        if (swept[0] === "tagspace" && wantsEmpty) {
            const closed = await closeEmptyTagspaces();
            console.log(closed.length > 0
                ? `closed the empty tagspaces: ${closed.join(" ")}`
                : "no empty tagspaces to close");
            return;
        }
        const run = MACHINES[swept[0] as keyof typeof MACHINES];
        if (!run) {
            throw new Error(
                `Usage: herbctl close <or-remove|window|tiling|xkill`
                + `|frame|tagspace [name]|notification>`
                + (positional[0]
                    ? ` — unknown mode '${positional[0]}'`
                    : ""),
            );
        }
        await run();
    },
});
