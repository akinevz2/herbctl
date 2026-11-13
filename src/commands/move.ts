// src/commands/move.ts — move — the pure layer-change verb: no
// geometry, no frames — the window moves BETWEEN LAYERS only.
//   move --to-float            float the focused window on (keeps its
//                              geometry; the yank precondition)
//   move --to-tiling           un-float it (the un-float chain: flags
//                              folded, floating off — re-tiles into
//                              the frame below whatever it holds)
//   --foreground               bring the window to the FOREGROUND of
//                              the float session after (floating_
//                              focused on + jumpto + bring)
//   --wid 0x…                  target THAT window (-w short) instead
//                              of the focused one
//
// At least one layer modifier is required — a modifier-free move would
// be a silent no-op. The whole operation runs under ONE lock.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr } from "../lib/hc.js";
import { layerMods, layerOptions, withLayerMods } from "../lib/layers.js";

export default defineCommand({
    name: "move" as never,
    description: "Move between layers",
    options: {
        wid: option(z.string().optional(), {
            description: "Move THIS window instead of the focused one",
            short: "w",
        }),
        ...layerOptions,
    },
    handler: async ({ flags }) => {
        const mods = layerMods(flags);
        if (!mods.toFloat && !mods.toTiling && !mods.foreground) {
            throw new Error("move: nothing to do — give --to-float, --to-tiling or --foreground");
        }
        const wid = flags.wid || (await attr("clients.focus.winid"));
        if (!wid) return; // no focused window: fail soft
        // The move IS the pre-layer write; the op itself is empty.
        await withLayerMods(wid, mods, async () => { /* the layer write */ });
        // --to-tiling without any geometry op still wants the foreground
        // chain's jumpto/bring to run after the un-float — handled by
        // withLayerMods' post pass above.
    },
});
