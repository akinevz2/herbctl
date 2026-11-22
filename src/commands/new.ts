// src/commands/new.ts — the ALLOCATE-AND-SWITCH verb. `new` allocates a
// new container and moves focus to it; the focus-free counterpart is
// the future `herbctl add` (allocate in the background, do not move
// focus).
//
// Subcommand syntax: `herbctl new <noun>` — today only `frame` (the
// migrated `new-frame`, see src/lib/chains.ts newFrame). `new tag` is
// reserved: create a tag and switch to it.
import { defineCommand } from "@bunli/core";

import { newFrame } from "../lib/chains.js";

const frame = defineCommand({
    name: "frame" as never,
    description: "Split, cycle frame (the former new-frame)",
    handler: async () => {
        const ok = await newFrame();
        if (ok === false) process.exit(1);
    },
});

export default defineCommand({
    name: "new" as never,
    description: "Allocate and switch to: frame, tag",
    commands: [frame],
});
