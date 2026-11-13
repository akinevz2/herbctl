// src/commands/corner.ts — pin the focused float to the TOP-LEFT
// QUADRANT of the monitor's work area (default) or the focused frame:
// the size becomes the quadrant (half the inner rect, decoration-
// aware, size-hint snapping reconciled), the position anchors at the
// top-left inner corner. The hc_floatx ModCtrl-x register calls this
// on an already-floating window.
// Layer modifiers compose around the pin: `corner --to-float` is the
// old standalone behavior (float on first, idempotent).
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr } from "../lib/hc.js";
import { cornerQuadrant } from "../lib/geometry.js";
import { layerMods, layerOptions, withLayerMods } from "../lib/layers.js";

export default defineCommand({
    name: "corner" as never,
    description: "Pin float to top-left quadrant",
    options: {
        wid: option(z.string().optional(), {
            description: "Pin THIS window instead of the focused one",
            short: "w",
        }),
        ...layerOptions,
    },
    handler: async ({ flags, positional }) => {
        const wid = flags.wid || (await attr("clients.focus.winid"));
        if (!wid) return; // no focused client: fail soft like the other helpers
        const target = positional[0] === "frame" ? "frame" : "root";
        await withLayerMods(wid, layerMods(flags), (w) => cornerQuadrant(w, target));
    },
});
