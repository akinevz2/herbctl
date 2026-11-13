// src/lib/layers.ts — the layer-change modifiers shared by the
// geometry verbs (the composition half of the atomicity contract:
// the verbs place/move geometry atomically; the LAYER state — float
// on/off, the float-session foreground — is expressed as modifiers and
// applied around the move under ONE lock).
//
//   --to-float    float the target window ON before the operation
//                 (idempotent on an already-floating window — the
//                 floating theme's decoration is then what the
//                 geometry math measures)
//   --to-tiling   UN-float the target first (fullscreen/pseudotile/
//                 floating off — the un-float chain; the window
//                 re-tiles into the frame below it)
//   --foreground  after the operation: bring the window to the
//                 FOREGROUND of the float session — floating_focused
//                 on (best-effort), jumpto, bring (the historical
//                 hc_center closing chain)
//
// With NO modifiers the verb runs bare — no lock taken, byte-identical
// to the atomic operation. With ANY modifier the verb takes ONE
// reference-counted lock around pre+op+post.

import { option } from "@bunli/core";
import { z } from "zod";

import { floatFlagsChain } from "./imperatives.js";
import { hc, setAttr } from "./hc.js";

/** The shared modifier options (spread into verb option schemas). */
export const layerOptions = {
    "to-float": option(z.boolean().default(false), {
        description: "Float the window ON first (idempotent when already floating)",
        argumentKind: "flag",
    }),
    "to-tiling": option(z.boolean().default(false), {
        description: "Un-float the window first (the un-float chain)",
        argumentKind: "flag",
    }),
    foreground: option(z.boolean().default(false), {
        description: "Foreground the float session after: floating_focused on + jumpto + bring",
        argumentKind: "flag",
    }),
};

export interface LayerFlags {
    "to-float"?: boolean;
    "to-tiling"?: boolean;
    foreground?: boolean;
}

export interface LayerMods {
    toFloat: boolean;
    toTiling: boolean;
    foreground: boolean;
}

export function layerMods(flags: LayerFlags): LayerMods {
    return {
        // bunli may camelCase dash-prefixed option keys — accept both
        // spellings.
        toFloat: flags["to-float"] === true || (flags as Record<string, unknown>).toFloat === true,
        toTiling: flags["to-tiling"] === true || (flags as Record<string, unknown>).toTiling === true,
        foreground: flags.foreground === true,
    };
}

/** True when any modifier is present (the lock-taking condition). */
export function hasLayerMods(m: LayerMods): boolean {
    return m.toFloat || m.toTiling || m.foreground;
}

/**
 * withLock — ONE reference-counted WM lock around `op`. The verbs that
 * own their modifier composition MANUALLY (corner: the flash fix needs
 * the geometry pre-set before the float-on, inside the lock) build
 * their sequence with this instead of withLayerMods.
 */
export async function withLock(op: () => Promise<void>): Promise<void> {
    await hc("lock");
    try {
        await op();
    } finally {
        await hc("unlock");
    }
}

/**
 * Run `op` composed with the layer modifiers, under ONE lock. Bare
 * (modifier-free) calls run op directly — no lock, no extra writes:
 * the byte-compatible atomic path.
 */
export async function withLayerMods(
    wid: string,
    mods: LayerMods,
    op: (wid: string) => Promise<void>,
): Promise<void> {
    if (!hasLayerMods(mods)) {
        await op(wid);
        return;
    }
    if (mods.toFloat && mods.toTiling) {
        throw new Error("--to-float and --to-tiling are mutually exclusive");
    }
    await hc("lock");
    try {
        // Pre-layer: the move INTO (or OUT of) the floating layer.
        // --to-float is a plain float-on write (the floating theme's
        // decoration must be what the geometry math measures);
        // --to-tiling is the full un-float chain (flags folded too).
        if (mods.toTiling) {
            await floatFlagsChain(wid, "off");
        } else if (mods.toFloat) {
            await setAttr(`clients.${wid}.floating`, "on");
        }
        await op(wid);
        // Post-layer: foreground the float session (best-effort writes
        // — jumpto/bring fail soft on a vanished window).
        if (mods.foreground) {
            await hc(
                "chain", ".",
                "try", "set_attr", "tags.focus.floating_focused", "on", ".",
                "jumpto", wid, ".",
                "bring", wid,
            );
        }
    } finally {
        await hc("unlock");
    }
}
