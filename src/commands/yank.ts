// src/commands/yank.ts — the yank/defer/slurp float session
// (the $Mod-x machine; reparented from `float yank`).
import { defineCommand } from "@bunli/core";

import { floatYank } from "../lib/extracted.js";

export default defineCommand({
    name: "yank" as never,
    description: "yank the focused window to the float layer (the defer/slurp session)",
    handler: async () => {
        await floatYank();
    },
});
