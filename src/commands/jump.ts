// src/commands/jump.ts — the get-family collapsed into one verb with
// a direction argument (was: get-south / get-forward / get-deck /
// get-dedeck as four bare verbs):
//
//   herbctl jump <south|forward|deck|dedeck|prev|next>
//
//   south    the zoom/peek grid ($Mod-s)
//   forward  leave the float layer, cycle ($Mod-w)
//   deck     count-gated cycling ($Mod-d)
//   dedeck   count-gated mix ($ModShift-d)
//   prev     the previous POPULATED tag ($Mod-bracketleft; the
//            hc_tag-cycle machine — empty tags and tags visible on
//            another monitor are skipped)
//   next     the next POPULATED tag ($Mod-bracketright; same machine)
//
// The machines themselves live verbatim in lib/chains.ts — jump is
// only the dispatch surface. The direction is a DECLARED required
// tail (the ARGS spec, entries = the six machines): a bare `herbctl
// jump` PROMPTS (the themed rofi list) instead of failing — the
// palette's empty-level submit (open.ts runPalette) expects exactly
// that; the hand-thrown usage Error here used to escape as the
// exit-1 CommandExecutionError JSON notification instead.
import { defineCommand } from "@bunli/core";

import {
    getDedeck,
    getDeck,
    getForward,
    getSouth,
    jumpNext,
    jumpPrev,
} from "../lib/chains.js";
import { ARG_EXIT, type ArgSpec, resolveVerbArgs } from "../lib/args.js";

const MACHINES = {
    south: { run: getSouth, label: "the zoom/peek grid" },
    forward: { run: getForward, label: "leave the float layer, cycle" },
    deck: { run: getDeck, label: "count-gated cycling" },
    dedeck: { run: getDedeck, label: "count-gated mix" },
    prev: { run: jumpPrev, label: "the previous populated tag (empty skipped)" },
    next: { run: jumpNext, label: "the next populated tag (empty skipped)" },
} as const;

const DIRECTIONS = Object.keys(MACHINES);

const ARGS: readonly ArgSpec[] = [
    {
        name: "direction",
        description: "the jump machine",
        required: true,
        promptTitle: "jump direction",
        entries: DIRECTIONS,
        validate: (v) =>
            DIRECTIONS.includes(v) ? undefined : `unknown direction '${v}'`,
    },
];

export default defineCommand({
    name: "jump" as never,
    description: "jump <south|forward|deck|dedeck|prev|next>",
    handler: async ({ positional }) => {
        const args = await resolveVerbArgs("jump", undefined, ARGS, positional);
        if (args === null) process.exit(ARG_EXIT);
        await MACHINES[args.direction as keyof typeof MACHINES].run();
    },
});
