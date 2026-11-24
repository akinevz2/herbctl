// src/commands/add.ts — the ALLOCATE-IN-PLACE verb. `add <object>`
// allocates a new object with focus REMAINING on the current object.
// `add --active <object>` aliases to `herbctl new <object>` (the
// focus-come-here semantics), per the allocation contract.
//
// ARGUMENTS — declarative, the single source of truth (see ARGS below):
//   object   tail  required  what to allocate (a choice list)
//   name     tail  per-object (the tagspace name — REQUIRED for
//                  tagspace: omitted it is prompted for, then the fail
//                  shape — / the terminal command, optional)
//
//   frame         split; the focused client keeps focus
//   terminal      a terminal spawns (--no-distract unless --active;
//                 --on <tagspace> attaches it REMOTELY with
//                 focus-stealing prevented)
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
import { type ArgSpec, resolveVerbArgs } from "../lib/args.js";
import { hc } from "../lib/hc.js";

const VERB = "add";

const OBJECTS = ["frame", "terminal", "notification", "tagspace"] as const;

const OBJECT_SPECS: Record<string, readonly ArgSpec[]> = {
    frame: [],
    terminal: [
        { name: "command", description: "the command to run (default: a login shell)" },
    ],
    notification: [],
    tagspace: [
        { name: "name", description: "the tagspace name", required: true, promptTitle: "tagspace name" },
    ],
};

export default defineCommand({
    name: "add" as never,
    description: "add <frame|terminal|notification|tagspace> — allocate, focus stays",
    options: {
        active: option(z.boolean().default(false), {
            description: "alias to `herbctl new <object>` (focus comes to the new object)",
            short: "a",
        }),
        on: option(z.string().optional(), {
            description: "allocate on a remote tagspace (focus-stealing prevented)",
            short: "o",
        }),
        directory: option(z.string().optional(), {
            description: "cd into <dir> first (the terminal's -d)",
            short: "d",
        }),
    },
    handler: async ({ flags, positional }) => {
        const [object, ...rest] = positional;
        const specs = OBJECT_SPECS[object ?? ""];
        if (!specs) {
            console.error(
                `Usage: herbctl add [--active] <${OBJECTS.join("|")}> [name]`
                + (object ? ` — unknown object '${object}'` : ""),
            );
            process.exit(2);
        }
        const args = await resolveVerbArgs(VERB, object, specs, rest);
        if (args === null) process.exit(2);
        const focus = !!flags.active;
        const on = flags.on || undefined;
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
            await allocateTerminal(focus, args.command, { on, directory: flags.directory });
            return;
        case "notification": {
            // notifications never take keyboard focus: new/add identical
            const ok = await allocateNotification();
            if (!ok) process.exit(1);
            return;
        }
        case "tagspace": {
            const tag = await allocateTagspace(focus, args.name);
            if (tag === null) process.exit(1);
            return;
        }
        }
    },
});
