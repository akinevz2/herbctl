// src/commands/new.ts — the ALLOCATE-AND-SWITCH verb. `new <object>`
// allocates a new object and brings focus to it; the focus-stays
// counterpart is `herbctl add` (allocate in the background).
//
//   herbctl new <frame|terminal|notification|tagspace> [name]
//
//   frame         split + cycle into the new frame (the migrated
//                 new-frame, lib/chains.ts newFrame)
//   terminal      a terminal spawns and TAKES focus on attach
//   notification  a dunst notification is allocated and raised (it
//                 never takes keyboard focus)
//   tagspace      an hlwm tag is created and entered (the smallest
//                 free numeric name; a name argument may be given)
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { newFrame } from "../lib/chains.js";
import {
    allocateNotification,
    allocateTagspace,
    allocateTerminal,
    ensureTagspace,
} from "../lib/allocate.js";

const USAGE =
    "Usage: herbctl new <frame|terminal|notification|tagspace> [name]";

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
    name: "new" as never,
    description: "Allocate and focus: frame, terminal, notification, tagspace",
    options: { on: onFlag(), directory: directoryFlag() },
    handler: async ({ flags, positional }) => {
        const object = positional[0];
        const name = positional[1];
        const on = flags.on;
        switch (object) {
        case "frame":
            return newFrame();
        case "terminal":
            if (on) await ensureTagspace(on);
            await allocateTerminal(true, name, { on, directory: flags.directory });
            return;
        case "notification": {
            const ok = await allocateNotification();
            if (!ok) process.exit(1);
            return;
        }
        case "tagspace": {
            const tag = await allocateTagspace(true, name);
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
