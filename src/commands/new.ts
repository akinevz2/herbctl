// src/commands/new.ts — the ALLOCATE-AND-SWITCH verb. `new <object>`
// allocates a new object and brings focus to it; the focus-stays
// counterpart is `herbctl add` (allocate in the background).
//
// ARGUMENTS — declarative, the single source of truth (see ARGS below):
//   object   tail  required  what to allocate (a choice list)
//   name     tail  per-object (the tagspace name / the terminal command)
//
//   frame         split + cycle into the new frame (the migrated
//                 new-frame, lib/chains.ts newFrame)
//   terminal      a terminal spawns and TAKES focus on attach
//   notification  a dunst notification is allocated and raised (it
//                 never takes keyboard focus)
//   tagspace      an hlwm tag is created and entered — the name is
//                 REQUIRED: omitted, it is prompted for (themed rofi
//                 input, then the urgent terminal); the prompt refused,
//                 the command fails with
//                 `argument name is required for new tagspace` (exit 2)
import { defineCommand } from "@bunli/core";

import { newFrame } from "../lib/chains.js";
import {
    allocateNotification,
    allocateTagspace,
    allocateTerminal,
} from "../lib/allocate.js";
import { type ArgSpec, resolveVerbArgs } from "../lib/args.js";

const VERB = "new";

/** the object surface — the object argument is a choice list, the name
 *  is only meaningful for some objects (per-object specs below). */
const OBJECTS = ["frame", "terminal", "notification", "tagspace"] as const;

const OBJECT_SPECS: Record<string, readonly ArgSpec[]> = {
    frame: [],
    terminal: [
        { name: "command", description: "the command to run (default: a login shell)" },
    ],
    notification: [],
    tagspace: [
        { name: "name", description: "the tagspace name", required: true, promptTitle: "new tagspace name" },
    ],
};

export default defineCommand({
    name: "new" as never,
    description: "new <frame|terminal|notification|tagspace> — allocate and focus to the new object",
    handler: async ({ positional }) => {
        const [object, ...rest] = positional;
        const specs = OBJECT_SPECS[object ?? ""];
        if (!specs) {
            console.error(
                `Usage: herbctl new <${OBJECTS.join("|")}> [name]`
                + (object ? ` — unknown object '${object}'` : ""),
            );
            process.exit(2);
        }
        const args = await resolveVerbArgs(VERB, object, specs, rest);
        if (args === null) process.exit(2);
        switch (object) {
        case "frame":
            return newFrame();
        case "terminal":
            await allocateTerminal(true, args.command);
            return;
        case "notification": {
            const ok = await allocateNotification();
            if (!ok) process.exit(1);
            return;
        }
        case "tagspace": {
            const tag = await allocateTagspace(true, args.name);
            if (tag === null) process.exit(1);
            return;
        }
        }
    },
});

