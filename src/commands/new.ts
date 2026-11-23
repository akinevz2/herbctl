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
import { defineCommand } from "@bunli/core";

import { newFrame } from "../lib/chains.js";
import {
    allocateNotification,
    allocateTagspace,
    allocateTerminal,
} from "../lib/allocate.js";

const USAGE =
    "Usage: herbctl new <frame|terminal|notification|tagspace> [name]";

export default defineCommand({
    name: "new" as never,
    description: "Allocate and focus: frame, terminal, notification, tagspace",
    handler: async ({ positional }) => {
        const object = positional[0];
        const name = positional[1];
        switch (object) {
        case "frame":
            return newFrame();
        case "terminal":
            await allocateTerminal(true);
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
