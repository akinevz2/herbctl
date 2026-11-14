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

import { attr, setAttr } from "../lib/hc.js";
import { computeQuadrant, writeQuadrant } from "../lib/geometry.js";
import { layerMods, layerOptions, withLock } from "../lib/layers.js";

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
        // NOTE: --to-float is handled MANUALLY here (not via
        // withLayerMods' pre-layer write): the flash fix needs the
        // corner geometry PRE-SET before the float-on, so the first
        // floating paint already sits in the quadrant (floating on
        // paints the window at its stale pre-float geometry until the
        // async floating_geometry write applies — the visible
        // tiled->corner flash the naive order produces). ONE lock
        // around the whole sequence (withLock — withLayerMods would
        // run bare since the pre-layer write is owned here).
        const mods = layerMods(flags);
        await withLock(async () => {
            const floating = await attr(`clients.${wid}.floating`);
            if (floating === "true" || floating === "on") {
                // already floating: pin it (the size becomes the
                // quadrant, deco-aware, size-hint reconciled)
                const want = await computeQuadrant(wid, target);
                await writeQuadrant(wid, want);
                return;
            }
            if (!mods.toFloat) {
                // GUARD: pinning a TILED client is not valid without
                // the --to-float modifier — the layout owns its
                // geometry. Throws (exit 1), so keybinds fall back:
                // `herbctl corner || herbctl float-unfocus`. The probe
                // read above IS the guard: no second floating read.
                throw new Error(
                    "corner: the client is tiled — the layout owns its geometry"
                        + " (pass --to-float to float first, or use a tiling verb)",
                );
            }
            // tiled + --to-float: PRE-SET the corner geometry (the
            // floating theme's deco margins — valid while tiled; the
            // write only takes effect on the float), THEN float on —
            // the first floating paint is already in the corner. ONE
            // write: the re-assert produced a second visible resize.
            const want = await computeQuadrant(wid, target);
            await setAttr(`clients.${wid}.floating_geometry`,
                `${want.width}x${want.height}+${want.x}+${want.y}`);
            await setAttr(`clients.${wid}.floating`, "on");
        });
    },
});
