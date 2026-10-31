// src/lib/hc.ts — herbctl's herbstclient spawn layer.
//
// Every command here issues the SAME herbstclient chains the dots
// bindings express (ports of ~/dots/herbstluftwm/.config/herbstluftwm/
// keys.d/{focus,floating,nav}.sh + the autostart, and the
// ~/dots/herbst_focus/.local/bin/{hc_zoom,hc_floatx,hc_focus} state
// machines — ported faithfully, token for token). The helpers the
// scripts delegate to (hc_center, hc_resize, hc_fit_to, hc_tile,
// hc_maximize, hc_unmaximize, polyframes) are spawned from the same
// place the scripts use: $HOME/.local/bin — override with
// HERBSTCTL_HELPER_DIR (tests point this at a fixture directory).
//
// Fail-soft everywhere (the dots wrapper convention): a failed
// herbstclient call (missing object, vanished window) resolves null
// instead of throwing — a vanished window may never wedge the bar or
// the keybind. The 5-second timeout is the dots wrapper convention
// too (a hung WM may never wedge the bar or the keybind) — inherited
// from herbstutil's spawn layer.

// herbstutil is imported by SIBLING-RELATIVE source path, not as a
// package dependency: bun 1.4.2 cannot resolve a transitive file:
// dependency (polyframes -> file:../herbctl -> file:../herbstutil
// fails on the second hop), and the three repos are always siblings
// in both checkout layouts (development/system/* and dots
// depends/.local/share/*). Consequence: herbctl is not npm-publishable
// as-is — the sibling invariant is documented in the README.
import { parseAttr } from "../../../herbstutil/src/commands/parse.js";

const HERBSTCLIENT = "herbstclient";

/** The dots helper directory (hc_center, hc_maximize, polyframes, …). */
export function helperDir(): string {
    return process.env.HERBSTCTL_HELPER_DIR ?? `${process.env.HOME}/.local/bin`;
}

/** Spawn env exactly like the dots scripts: DISPLAY defaults to
 *  localhost:0.0 (WSL2 + VcXsrv convention), WAYLAND_DISPLAY stripped
 *  (WSLg's socket makes dual-backend apps abort). */
function spawnEnv(): Record<string, string> {
    const { WAYLAND_DISPLAY: _strip, ...rest } = process.env;
    return { ...rest, DISPLAY: process.env.DISPLAY || "localhost:0.0" };
}

/**
 * Run `herbstclient <args...>`. Resolves { stdout } on exit 0, null on
 * ANY failure (missing object / unreachable WM / 5s timeout) — the
 * fail-soft contract; callers branch on null instead of catching.
 * The 5-second timeout is the dots wrapper convention (a hung WM may
 * never wedge the bar or the keybind).
 */
export async function hc(...args: string[]): Promise<{ stdout: string } | null> {
    try {
        const proc = Bun.spawn([HERBSTCLIENT, ...args], {
            stdout: "pipe",
            stderr: "pipe",
            env: spawnEnv(),
            timeout: 5000,
        });
        const stdout = await new Response(proc.stdout).text();
        const code = await proc.exited;
        return code === 0 ? { stdout } : null;
    } catch {
        return null;
    }
}

/**
 * Run a dots helper script (hc_center, hc_resize, hc_fit_to, hc_tile,
 * hc_maximize, hc_unmaximize) to completion. Resolves true on exit 0 —
 * the scripts' callers all use `|| true`, so failures are tolerated.
 */
export async function helper(name: string, args: string[] = []): Promise<boolean> {
    try {
        const proc = Bun.spawn([`${helperDir()}/${name}`, ...args], {
            stdout: "ignore",
            stderr: "ignore",
            env: spawnEnv(),
            timeout: 5000,
        });
        return (await proc.exited) === 0;
    } catch {
        return false;
    }
}

/** Raw leaf read, trimmed ("" when the read failed). */
export async function attrRaw(path: string): Promise<string> {
    return (await hc("attr", path))?.stdout.trim() ?? "";
}

/**
 * Typed leaf read via herbstutil's parseAttr — the herbstutil
 * integration surface: a bare `herbstclient attr <path>` reply parsed
 * into its hlwm-typed value (bools as booleans, ints as numbers,
 * strings unquoted). Resolves null when the read failed (fail-soft).
 */
export async function attrValue<T = string | number | boolean>(path: string): Promise<T | null> {
    const r = await hc("attr", path);
    if (r === null) return null;
    return parseAttr(r.stdout).value as T;
}

/** herbstclient list_clients --tag=NAME → wids (WM order). */
export async function listClientsByTag(tag: string): Promise<string[]> {
    const r = await hc("list_clients", `--tag=${tag}`);
    if (r === null) return [];
    return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}
