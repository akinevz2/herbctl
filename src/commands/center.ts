// src/commands/center.ts — centered floating geometry (the migrated
// hc_center). Bare: the ATOMIC move — place the focused window
// centered (size-preserving) in the target rect, nothing else.
// Modifiers compose the layer state around it:
//   --to-float    float the window on first (idempotent when already
//                 floating — the old hc_center float-first behavior)
//   --foreground  bring the window to the FOREGROUND of the float
//                 session after: floating_focused on + jumpto +
//                 bring — the historical closing chain
//   --wid 0x…     center THAT window within its OWN parent frame
//                 instead (-w short; no float toggling — old
//                 centerInFrame semantics; modifiers still apply)
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr } from "../lib/hc.js";
import { centerWindowInOwnFrame, placeCenteredIn } from "../lib/geometry.js";
import { layerMods, layerOptions, withLayerMods } from "../lib/layers.js";

export default defineCommand({
    name: "center" as never,
    description: "Center the focused window",
    options: {
        wid: option(z.string().optional(), {
            description:
                "Center THIS specific window within its OWN parent frame instead of the focused one (old centerInFrame semantics; no float toggling)",
            short: "w",
        }),
        ...layerOptions,
    },
    handler: async ({ flags, positional }) => {
        const mods = layerMods(flags);
        if (flags.wid) {
            await withLayerMods(flags.wid, mods, (wid) => centerWindowInOwnFrame(wid));
            return;
        }
        const target = positional[0] ?? "root";
        const geoPath = target === "frame"
            ? "tags.focus.tiling.focused_frame.content_geometry"
            : target === "root"
                ? "tags.focus.tiling.root.content_geometry"
                : null;
        if (geoPath === null) {
            throw new Error(`center: unknown target '${target}' (use frame|root)`);
        }
        const winid = await attr("clients.focus.winid");
        if (!winid) return; // no focused window: fail soft like the other helpers
        await withLayerMods(winid, mods, (wid) => placeCenteredIn(wid, geoPath));
    },
});
