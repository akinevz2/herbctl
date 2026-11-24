// src/commands/find.ts — `find <string>`: a needle resolves to a tag
// first, else to client titles (one match jumps, many open the rofi
// window switcher with the scroll-preview navigation — the machine is
// lib/find.ts).
import { defineCommand } from "@bunli/core";

import { findMachine, USAGE } from "../lib/find.js";

export default defineCommand({
    name: "find" as never,
    description: "find <string> — a tag, else client titles",
    handler: async ({ positional }) => {
        const needle = positional.join(" ");
        if (needle === "") throw new Error(USAGE);
        await findMachine(needle);
    },
});
