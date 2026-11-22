// src/commands/frame.ts — the frame-family collapsed into one verb
// with a direction argument and modifiers (was: focus-frame-left /
// focus-frame-down / split-right-cycle / split-right-focus /
// split-bottom-focus / split-down / new-frame / explode-frame as
// eight bare verbs):
//
//   herbctl frame <left|down|right|bottom|new|explode> [--cycle] [--shift]
//
//   left            focus the frame left, else split left into it
//   down            focus the frame down, else split bottom + cycle in
//   right           split right 0.5, focus into the new frame
//   right --cycle   split right 0.5, cycle into it
//   bottom          split bottom 0.5, focus into the new frame
//   down --shift    split + shift the window down (multi-window frames)
//   new             split auto + cycle frame (only when windows exist)
//   explode         cycle or explode
//
// The machines live verbatim in lib/chains.ts — frame is only the
// dispatch surface.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import {
    explodeFrame,
    focusFrameDown,
    focusFrameLeft,
    newFrame,
    splitBottomFocus,
    splitDown,
    splitRightCycle,
    splitRightFocus,
} from "../lib/chains.js";

const USAGE = "Usage: herbctl frame <left|down|right|bottom|new|explode> [--cycle] [--shift]";

export default defineCommand({
    name: "frame" as never,
    description: "frame <left|down|right|bottom|new|explode>",
    options: {
        cycle: option(z.boolean().default(false), {
            description: "the cycle variant of the direction (frame right)",
            short: "c",
            argumentKind: "flag",
        }),
        shift: option(z.boolean().default(false), {
            description: "the window-shift variant (frame down --shift)",
            short: "s",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags, positional }) => {
        const dir = positional[0];
        if (flags.shift) {
            if (dir === "down") return void (await splitDown());
            throw new Error(`${USAGE} — --shift only combines with 'down'`);
        }
        if (flags.cycle) {
            if (dir === "right") return void (await splitRightCycle());
            throw new Error(
                `${USAGE} — --cycle only combines with 'right'`,
            );
        }
        switch (dir) {
            case "left": return void (await focusFrameLeft());
            case "down": return void (await focusFrameDown());
            case "right": return void (await splitRightFocus());
            case "bottom": return void (await splitBottomFocus());
            case "new": return void (await newFrame());
            case "explode": return void (await explodeFrame());
            default:
                throw new Error(
                    USAGE + (dir ? ` — unknown direction '${dir}'` : ""),
                );
        }
    },
});
