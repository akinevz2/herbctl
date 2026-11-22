// src/commands/shift.ts — the shift-family collapsed into one verb
// with a direction argument (was: shift-up / shift-down / shift-left /
// shift-right as four bare verbs):
//
//   herbctl shift <up|down|left|right>
//
// The window-shift machines live verbatim in lib/chains.ts — shift is
// only the dispatch surface.
import { defineCommand } from "@bunli/core";

import {
    shiftDown,
    shiftLeft,
    shiftRight,
    shiftUp,
} from "../lib/chains.js";

const MACHINES = {
    up: { run: shiftUp, label: "shift up (empty frame removed first)" },
    down: { run: shiftDown, label: "shift down (split when nothing below)" },
    left: { run: shiftLeft, label: "shift or split-and-shift left" },
    right: { run: shiftRight, label: "shift, else split right and focus" },
} as const;

export default defineCommand({
    name: "shift" as never,
    description: "shift <up|down|left|right>",
    handler: async ({ positional }) => {
        const entry = MACHINES[positional[0] as keyof typeof MACHINES];
        if (!entry) {
            throw new Error(
                `Usage: herbctl shift <up|down|left|right>`
                + (positional[0]
                    ? ` — unknown direction '${positional[0]}'`
                    : ""),
            );
        }
        await entry.run();
    },
});
