// src/commands/split.ts — the split-family collapsed into one verb
// with a mode argument (was: split-new / split-launch as two bare
// verbs):
//
//   herbctl split <new|launch> [launcher command...]
//
//   new            split auto, tile the focused window into the new
//                  half ($ModShift-e)
//   launch CMD...  run the launcher, give it its own frame
//                  ($ModShift-Return)
//
// The machines live in lib/{tile,split-launch}.ts — split is only the
// dispatch surface.
import { defineCommand } from "@bunli/core";

import { splitLaunch } from "../lib/split-launch.js";
import { hc } from "../lib/hc.js";
import { tile } from "../lib/tile.js";

async function splitNew(): Promise<void> {
    await hc("split", "auto");
    await tile();
}

export default defineCommand({
    name: "split" as never,
    description: "split <new|launch>",
    handler: async ({ positional }) => {
        const [mode = "", cmd = "", ...args] = positional;
        if (mode === "new") {
            await splitNew();
            return;
        }
        if (mode === "launch") {
            if (cmd === "") {
                throw new Error("Usage: herbctl split launch <launcher command...>");
            }
            await splitLaunch(cmd, args);
            return;
        }
        throw new Error(
            `Usage: herbctl split <new|launch> [launcher command...]`
            + (mode ? ` — unknown mode '${mode}'` : ""),
        );
    },
});
