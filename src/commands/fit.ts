// src/commands/fit.ts — constraint pass for a floating window: shrink
// oversized windows, nudge off-screen ones (deco-aware), size-preserving
// otherwise. Target: "monitor" (default, the work area) or the focused
// "frame". `hc_fit_to [monitor|frame]` is its dots shim.
// Layer modifiers (--to-float/--foreground) compose around the fit.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr } from "../lib/hc.js";
import { fitTo } from "../lib/geometry.js";
import { layerMods, layerOptions, withLayerMods } from "../lib/layers.js";

export default defineCommand({
    name: "fit" as never,
    description: "Fit float to bounds",
    options: {
        wid: option(z.string().optional(), {
            description: "Fit THIS window instead of the focused one",
            short: "w",
        }),
        target: option(z.enum(["monitor", "frame"]).default("monitor"), {
            description: "Rectangle to fit within:",
            short: "t",
        }),
        ...layerOptions,
    },
    handler: async ({ flags, positional }) => {
        const wid = flags.wid || (await attr("clients.focus.winid"));
        if (!wid) return; // no focused client: fail soft like the other helpers
        const target = positional[0] === "frame" || positional[0] === "monitor"
            ? positional[0]
            : flags.target ?? "monitor";
        await withLayerMods(wid, layerMods(flags),
            (w) => fitTo(w, target === "frame" ? "frame" : "root"));
    },
});
