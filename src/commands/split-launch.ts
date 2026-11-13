// src/commands/split-launch.ts — run a launcher, then give the
// launched application its own frame (the migrated hc_split-launch;
// $ModShift-Return). See src/lib/split-launch.ts for the machine.
import { defineCommand } from "@bunli/core";

import { splitLaunch } from "../lib/split-launch.js";

export default defineCommand({
    name: "split-launch" as never,
    description: "Launch, split for it",
    handler: async ({ positional }) => {
        const [cmd = "", ...args] = positional;
        if (cmd === "") {
            throw new Error("Usage: herbctl split-launch <launcher command...>");
        }
        await splitLaunch(cmd, args);
    },
});
