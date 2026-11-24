// src/commands/frame.ts — the frame-family collapsed into one verb
// with a direction argument and modifiers (was: focus-frame-left /
// focus-frame-down / split-right-cycle / split-right-focus /
// split-bottom-focus / split-down / explode-frame as bare verbs; the
// bare `frame` cycler of the focus verb exploded here; `new frame`
// lives at `herbctl new frame`):
//
//   herbctl frame [left|down|right|bottom|explode] [--cycle] [--shift]
//
//   bare            the explode machine (cycle back, else explode +
//                   cycle forward)
//   left            focus the frame left, else split left into it
//   down            focus the frame down, else split bottom + cycle in
//   right           split right 0.5, focus into the new frame
//   right --cycle   split right 0.5, cycle into it
//   bottom          split bottom 0.5, focus into the new frame
//   <dir> --shift   with >1 window in the focused frame: split in that
//                   direction and shift the window into the new frame
//                   (down/bottom: split bottom + shift down)
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
    splitBottomFocus,
    splitDown,
    splitLeftShift,
    splitRightCycle,
    splitRightFocus,
    splitRightShift,
} from "../lib/chains.js";

const USAGE =
    "Usage: herbctl frame [left|down|right|bottom|explode] [--cycle] [--shift]";

export default defineCommand({
    name: "frame" as never,
    description: "frame [left|down|right|bottom|explode]",
    options: {
        cycle: option(z.boolean().default(false), {
            description: "the cycle variant of the direction (frame right)",
            short: "c",
            argumentKind: "flag",
        }),
        shift: option(z.boolean().default(false), {
            description: "the window-shift variant of the direction",
            short: "s",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags, positional }) => {
        const dir = positional[0];
        if (dir === undefined) return void (await explodeFrame());
        if (flags.shift) {
            if (dir === "down" || dir === "bottom") return void (await splitDown());
            if (dir === "left") return void (await splitLeftShift());
            if (dir === "right") return void (await splitRightShift());
            throw new Error(`${USAGE} — --shift only combines with a direction`);
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
            case "explode": return void (await explodeFrame());
            default:
                throw new Error(
                    USAGE + (dir ? ` — unknown direction '${dir}'` : ""),
                );
        }
    },
});
