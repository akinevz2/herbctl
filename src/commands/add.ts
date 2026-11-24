// src/commands/add.ts — the ALLOCATE-IN-PLACE verb. `add <object>`
// allocates a new object with focus REMAINING on the current object.
// `add --active <object>` aliases to `herbctl new <object>` (the
// focus-come-here semantics), per the allocation contract.
//
//   herbctl add [--active] <frame|terminal|notification|tagspace> [name]
//
//   frame         split; the focused client keeps focus
//   terminal      a terminal spawns via the --no-distract rule (it does
//                 NOT take focus on attach)
//   notification  a dunst notification is allocated (identical to new —
//                 notifications never take keyboard focus)
//   tagspace      an hlwm tag is created (entered only with --active)
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { newFrame } from "../lib/chains.js";
import {
    allocateNotification,
    allocateTagspace,
    allocateTerminal,
    ensureTagspace,
} from "../lib/allocate.js";
import { hc } from "../lib/hc.js";

const USAGE =
    "Usage: herbctl add [--active] <frame|terminal|notification|tagspace> [name]";

/** --on <tagspace>: allocate on a REMOTE tagspace with focus-stealing
 *  prevention (the current client stays focused). */
const onFlag = () =>
    option(z.string().optional(), {
        description: "allocate on a remote tagspace (focus-stealing prevented)",
        short: "o",
    });

const directoryFlag = () =>
    option(z.string().optional(), {
        description: "cd into <dir> first (the terminal's -d)",
        short: "d",
    });

export default defineCommand({
    name: "add" as never,
    description: "add <frame|terminal|notification|tagspace> — focus stays",
    options: {
        active: option(z.boolean().default(false), {
            description: "alias to `herbctl new <object>` (focus comes to the new object)",
            short: "a",
        }),
        on: onFlag(),
        directory: directoryFlag(),
    },
    handler: async ({ flags, positional }) => {
        const object = positional[0];
        const name = positional[1];
        const focus = !!flags.active;
        const on = flags.on;
        switch (object) {
        case "frame":
            if (focus) {
                await newFrame();
                return;
            }
            // hlwm's bare split keeps the focused client focused
            await hc("split", "auto");
            return;
        case "terminal":
            if (on) await ensureTagspace(on);
            await allocateTerminal(focus, name, { on, directory: flags.directory });
            return;
        case "notification": {
            // notifications never take keyboard focus: new/add identical
            const ok = await allocateNotification();
            if (!ok) process.exit(1);
            return;
        }
        case "tagspace": {
            const tag = await allocateTagspace(focus, name);
            if (tag === null) process.exit(1);
            return;
        }
        default:
            console.error(
                USAGE + (object ? ` — unknown object '${object}'` : ""),
            );
            process.exit(2);
        }
    },
});
