// src/commands/find.ts — `find [string]`: bare, the GLOBAL window
// selector (every window with its tag, minimized and floating states);
// with a needle, a tag resolves first, else the needle PRE-FILLS the
// selector's rofi filter — rofi's own matching selects the window
// (the machine is lib/find.ts).
import { defineCommand } from "@bunli/core";

import { findMachine } from "../lib/find.js";

export default defineCommand({
    name: "find" as never,
    description:
        "find [string] — bare: the global window selector; a needle: a tag, else window titles",
    handler: async ({ positional }) => {
        await findMachine(positional.join(" ").trim());
    },
});
