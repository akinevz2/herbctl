// src/commands/toggle.ts — the toggle-family collapsed into one verb
// (was: fullscreen-toggle / minimize-toggle as two bare verbs, plus
// the targeted minimize machine):
//
//   herbctl toggle <fullscreen|minimize> [targeting flags]
//
//   fullscreen            the fullscreen toggle machine
//   minimize              the minimize TOGGLE machine (restore the
//                         most recently minimized client, else
//                         minimize the focused one)
//   minimize --wid/-c/-f  the TARGETED minimize machine instead
//                         (--wid 0x… explicit, --frame-selected the
//                         selected tiling-frame client, --float the
//                         focused float)
//
// The toggle machines live in lib/chains.ts, the targeted minimize in
// lib/minimize.ts — toggle is only the dispatch surface.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { fullscreenToggle, minimizeToggle } from "../lib/chains.js";
import minimizeVerb from "../lib/minimize.js";

const USAGE = "Usage: herbctl toggle <fullscreen|minimize>";

export default defineCommand({
    name: "toggle" as never,
    description: "toggle <fullscreen|minimize>",
    options: {
        wid: option(z.string().optional(), {
            description: "minimize: target THIS window", short: "w",
        }),
        "frame-selected": option(z.boolean().default(false), {
            description: "minimize: target the selected client of the tiling frame",
            short: "c",
            argumentKind: "flag",
        }),
        float: option(z.boolean().default(false), {
            description: "minimize: target the focused floating window",
            short: "f",
            argumentKind: "flag",
        }),
        focused: option(z.boolean().default(false), {
            description:
                "minimize: the TARGETED machine bare — minimize the focused client, or close_or_remove the empty focused frame (the hc_minimize idiom)",
            short: "F",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags, positional }) => {
        switch (positional[0]) {
            case "fullscreen":
                await fullscreenToggle();
                return;
            case "minimize": {
                // Bare: the toggle machine. Targeting flags: the
                // targeted minimize machine (not a duplicate — it is
                // the WHICH-window half of the same surface).
                const targeted = flags.wid !== undefined
                    || flags["frame-selected"]
                    || flags.float
                    || flags.focused;
                if (targeted) {
                    const handler = (minimizeVerb as unknown as {
                        handler: (ctx: never) => Promise<void>;
                    }).handler;
                    await handler({ flags, positional: [] } as never);
                    return;
                }
                await minimizeToggle();
                return;
            }
            default:
                throw new Error(
                    USAGE
                    + (positional[0]
                        ? ` — unknown mode '${positional[0]}'`
                        : ""),
                );
        }
    },
});
