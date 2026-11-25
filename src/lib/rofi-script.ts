// src/lib/rofi-script.ts — the rofi SCRIPT-MODE layer (migrated with the
// hidden picker from polyframes' lib/menus/rofi.ts; the dmenu layer in
// src/lib/rofi.ts stays the plain-palette surface).
//
// Two invocation modes live in every script-mode menu:
//   1. launcher — no $ROFI_RETV: exec rofi in script mode, pointing it
//      at THIS binary through the mode command (rofi runs the command
//      via the shell, so paths are quoted).
//   2. backend  — $ROFI_RETV set: rofi re-invoked us with the response
//      code; emit rows / perform actions per the script-mode protocol.

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { hc } from "./hc.js";
import { spawnEnv } from "./rofi.js";
import { ui } from "./debug.js";

/** US (0x1f) separates meta fields inside one row; NUL (0x0) separates
 *  the display text from its meta fields; rows are NEWLINE-terminated
 *  (rofi splits the emitted lines on \n — see rofi-script(5)). */
export const US = "\x1f";
export const NUL = "\x00";

/**
 * Build one script-mode row: `display\0meta\x1f…\n`. The varargs are
 * the flat meta sequence (name, value, name, value, …), joined by US.
 * Ends with NEWLINE, never NUL.
 */
export function row(display: string, ...meta: (string | number)[]): string {
    if (meta.length === 0) return `${display}\n`;
    return `${display}${NUL}${meta.join(US)}\n`;
}

/** A menu configuration line: "\0<name><US><value>\n". */
export function menuOpt(name: string, value: string): string {
    return `\x00${name}${US}${value}\n`;
}

export const ROFI_RETV = () => process.env.ROFI_RETV;

/**
 * How the binary refers to ITSELF in rofi mode commands (polyframes'
 * selfCommand shape, migrated): the mode backend is a SEPARATE process
 * rofi re-invokes, so the absolute executable path is the contract.
 *   1. $HERBCTL_SELF (explicit override, testing)
 *   2. Compiled binary: realpath(process.execPath)
 *   3. Dev mode (`bun run src/index.ts`): a bun invocation of the TS
 *      entry.
 */
export function selfCommand(): string {
    if (process.env.HERBCTL_SELF) return process.env.HERBCTL_SELF;
    const execPath = process.execPath ?? "";
    const argv0 = process.argv[0] ?? "";
    const isBunRuntime = /(^|\/)bun(\.[a-z0-9]+)?$/.test(execPath)
        || argv0.startsWith("/$bunfs");
    if (isBunRuntime && !argv0.startsWith("/$bunfs")) {
        return `bun run ${import.meta.path}`;
    }
    try {
        return realpathSync(execPath || argv0);
    } catch {
        return execPath || argv0;
    }
}

/** Shell-quote one argv element for the rofi mode command (rofi spawns
 *  the script-mode helper with the shell). */
function shQuote(s: string): string {
    return `'${s.replace(/'/g, String.raw`\x27`)}'`;
}

/** Build a rofi `-modi` value: "name:<shell-quoted self command>". */
export function modeSpec(name: string, args: string[]): string {
    const cmd = [selfCommand(), ...args].map(shQuote).join(" ");
    return `${name}:${cmd}`;
}

/** hlwm geometry string ("WxH+X+Y") → rect, or null. */
function parseHlwmRect(s: string | null | undefined): {
    x: number; y: number; width: number; height: number;
} | null {
    const m = s?.match(/^(\d+)x(\d+)([+-]\d+)([+-]\d+)$/);
    return m
        ? { x: Number(m[3]), y: Number(m[4]), width: Number(m[1]), height: Number(m[2]) }
        : null;
}

/**
 * Menu positioning per the bar (migrated verbatim from polyframes): the
 * menu anchors at the BAR's edge (below a top bar, above a bottom one —
 * read from the pad bands: monitor geometry vs the work area) and
 * shifts horizontally by the CLICKED LABEL's offset from the bar's
 * center (0 = the centered default for keybind-opened menus). Rofi
 * theme offsets don't need the menu's own size: `anchor` picks the edge
 * and the offsets are relative to that anchor point.
 */
export async function menuPositionArgs(xOffsetPx = 0): Promise<string[]> {
    const mon = parseHlwmRect(await hc("attr", "monitors.focus.geometry").then((r) => r?.stdout.trim() ?? null));
    const work = parseHlwmRect(await hc("attr", "tags.focus.tiling.root.content_geometry").then((r) => r?.stdout.trim() ?? null));
    if (!mon || !work) return [];

    const padTop = work.y - mon.y;
    const padBottom = (mon.y + mon.height) - (work.y + work.height);
    const gap = 4;

    // Horizontal: the clicked label's offset from the bar's center.
    const dx = Math.round(xOffsetPx);

    if (padBottom >= padTop && padBottom > 0) {
        // Bottom bar: bottom-anchor the menu just above it.
        return ["-theme-str", `window { anchor: south; x-offset: ${dx}px; y-offset: -${padBottom + gap}px; }`];
    }
    if (padTop > 0) {
        // Top bar: top-anchor the menu just below it.
        return ["-theme-str", `window { anchor: north; x-offset: ${dx}px; y-offset: ${padTop + gap}px; }`];
    }
    // No pads: keep the label's displacement, vertical center.
    return ["-theme-str", `window { anchor: center; x-offset: ${dx}px; }`];
}

/**
 * Launcher mode: run rofi synchronously (its UI), pointed at
 * `<self> <backendArgs>` as the mode's backend. stdio is inherited,
 * like the shell originals' exec. Never returns (exits with rofi's
 * status — the keybind chains' exit-code contract).
 */
export async function launchRofi(
    rofiArgs: string[],
    backendArgs: string[] = [],
    xOffsetPx = 0,
): Promise<never> {
    const modeCmd = [selfCommand(), ...backendArgs].map(shQuote).join(" ");
    const pos = await menuPositionArgs(xOffsetPx);
    ui("launchRofi: rofi %j (backend: %j)", rofiArgs, modeCmd);
    const r = spawnSync("rofi", [...rofiArgs, ...pos], { env: spawnEnv(), stdio: "inherit" });
    process.exit(r.status ?? 1);
}
