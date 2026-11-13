// src/lib/debug.ts — env-gated verbose logging for the migrated
// geometry machines (the polyframes debug layer, trimmed to what the
// WM helpers need).
//
//   HERBSTCTL_VERBOSE=1   everything on stderr
//   HERBSTCTL_VERBOSE=ui  only the "ui" layer
//
// stderr, never stdout: the verbs' stdout is consumed by scripts
// (resize emits its JSON line there).

import { format as printf } from "node:util";

const LAYERS = ["ui"] as const;
type Layer = (typeof LAYERS)[number];

let layers: Set<Layer> | null = null;
{
    const raw = process.env.HERBSTCTL_VERBOSE;
    if (raw === "1" || raw === "all" || raw === "true") {
        layers = new Set(LAYERS);
    } else if (raw) {
        layers = new Set(
            raw.split(/[,\s]+/).filter((l): l is Layer => (LAYERS as readonly string[]).includes(l)),
        );
    }
}

/** printf-style debug on the "ui" layer (env-gated, stderr). */
export const ui = (fmt: string, ...args: unknown[]): void => {
    if (!layers || !layers.has("ui")) return;
    process.stderr.write(`[herbctl:ui] ${printf(fmt, ...args)}\n`);
};
