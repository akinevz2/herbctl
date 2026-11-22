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
import { defineCommand } from "@bunli/core";

import {
    closeOrRemove,
    closeWindow,
    xkillOrClose,
} from "../lib/chains.js";
import { attr, hc } from "../lib/hc.js";

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
} as const;

export default defineCommand({
    name: "close" as never,
    description: "close <or-remove|window|tiling|xkill>",
    handler: async ({ positional }) => {
        const run = MACHINES[positional[0] as keyof typeof MACHINES];
        if (!run) {
            throw new Error(
                `Usage: herbctl close <or-remove|window|tiling|xkill>`
                + (positional[0]
                    ? ` — unknown mode '${positional[0]}'`
                    : ""),
            );
        }
        await run();
    },
});
