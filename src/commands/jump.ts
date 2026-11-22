// src/commands/jump.ts — the get-family collapsed into one verb with
// a direction argument (was: get-south / get-forward / get-deck /
// get-dedeck as four bare verbs):
//
//   herbctl jump <south|forward|deck|dedeck>
//
//   south    the zoom/peek grid ($Mod-s)
//   forward  leave the float layer, cycle ($Mod-w)
//   deck     count-gated cycling ($Mod-d)
//   dedeck   count-gated mix ($ModShift-d)
//
// The machines themselves live verbatim in lib/chains.ts — jump is
// only the dispatch surface.
import { defineCommand } from "@bunli/core";

import {
    getDedeck,
    getDeck,
    getForward,
    getSouth,
} from "../lib/chains.js";

const MACHINES = {
    south: { run: getSouth, label: "the zoom/peek grid" },
    forward: { run: getForward, label: "leave the float layer, cycle" },
    deck: { run: getDeck, label: "count-gated cycling" },
    dedeck: { run: getDedeck, label: "count-gated mix" },
} as const;

export default defineCommand({
    name: "jump" as never,
    description: "jump <south|forward|deck|dedeck>",
    handler: async ({ positional }) => {
        const entry = MACHINES[positional[0] as keyof typeof MACHINES];
        if (!entry) {
            throw new Error(
                `Usage: herbctl jump <south|forward|deck|dedeck>`
                + (positional[0]
                    ? ` — unknown direction '${positional[0]}'`
                    : ""),
            );
        }
        await entry.run();
    },
});
