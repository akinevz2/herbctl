// src/commands/jump.ts — the get-family collapsed into one verb with
// a direction argument (was: get-south / get-forward / get-deck /
// get-dedeck as four bare verbs):
//
//   herbctl jump <south|forward|backward|deck|dedeck|prev|next>
//
//   south    the corrected-invariant backward cycle ($Mod-s): cycle
//            preferred over cycle_frame on a single root child or a
//            max frame; cycle_frame preferred over cycle otherwise
//   south    the corrected-invariant backward cycle ($Mod-s): cycle
//            preferred over cycle_frame on a single root child or a
//            max frame; cycle_frame preferred over cycle otherwise
//   forward  the PRIME jump-forward machine ($Mod-w): float pre-step,
//            intra-frame cycle +1, frame-up focus, cycle_frame last
//   backward the OVERLOADED explode ($Mod-e): explodeFrame prime on
//            non-max frames, cycle_frame -1 traversal on max
//            (the restored herbctl-nav-cycle explode-frame register,
//            de-exploded: the explode machine moved to south)
//   deck     count-gated cycling ($Mod-d)
//   dedeck   count-gated mix ($ModShift-d)
//   prev     the previous POPULATED tag ($Mod-bracketleft; the
//            hc_tag-cycle machine — empty tags and tags visible on
//            another monitor are skipped)
//   next     the next POPULATED tag ($Mod-bracketright; same machine)
//
// The machines themselves live verbatim in lib/chains.ts — jump is
// only the dispatch surface. The direction is a DECLARED required
// tail (the ARGS spec, entries = the seven machines): a bare `herbctl
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
    jumpBackward,
    jumpNext,
    jumpPrev,
    southExplode,
} from "../lib/chains.js";
import { ARG_EXIT, type ArgSpec, resolveVerbArgs } from "../lib/args.js";

const MACHINES = {
    south: { run: southExplode, label: "single root child / max frame: cycle first; else cycle_frame first" },
    forward: { run: getForward, label: "contravariant forward cycle (cycle +1 / cycle_frame +1)" },
    backward: { run: jumpBackward, label: "contravariant backward cycle (cycle -1 / cycle_frame -1)" },
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
    description: "jump <south|forward|backward|deck|dedeck|prev|next>",
    handler: async ({ positional }) => {
        const args = await resolveVerbArgs("jump", undefined, ARGS, positional);
        if (args === null) process.exit(ARG_EXIT);
        await MACHINES[args.direction as keyof typeof MACHINES].run();
    },
});
