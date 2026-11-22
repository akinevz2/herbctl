// src/lib/rofi.ts — the shared rofi dmenu layer (the hc_command
// palette machinery, made reusable for herbctl's interactive verbs:
// `open` and `run`).
//
// The keymap is the palette convention (rofi 2.0 custom keys):
//   Return            rc 0   accept entry (or typed text)
//   Shift-Return      rc 10  kb-custom-1
//   Ctrl-Shift-Return rc 11  kb-custom-2  (terminal variant)
//   Tab               rc 12  kb-custom-3  (complete / descend)
//   Ctrl-Return       rc 13  kb-custom-4
//   Escape            rc 1   cancel (empty selection)
//
// The default keys occupying those slots (kb-accept-custom on
// Ctrl+Return, kb-element-next on Tab, …) are unbound first; arrows
// still move the selection. dmenu has NO inline completion: the
// "complete" action is the caller re-opening the menu with -filter.
//
// Theme: ~/.config/rofi/command.rasi (the hc_command palette look)
// when it exists, no theme otherwise — fail-soft, like everything
// here.

/** Spawn env exactly like the dots scripts: DISPLAY defaults to
 *  localhost:0.0 (WSL2 + VcXsrv convention), WAYLAND_DISPLAY stripped
 *  (WSLg's socket makes dual-backend apps abort). */
export function spawnEnv(): Record<string, string> {
    const { WAYLAND_DISPLAY: _strip, ...rest } = process.env;
    return { ...rest, DISPLAY: process.env.DISPLAY || "localhost:0.0" };
}

import { existsSync } from "node:fs";

/** The palette theme path, when it is installed (null otherwise). */
export function rofiThemePath(): string | null {
    const path = `${process.env.HOME}/.config/rofi/command.rasi`;
    try {
        return existsSync(path) ? path : null;
    } catch {
        return null;
    }
}

export interface RofiMenuOptions {
    prompt: string;
    entries: string[];
    /** Pre-filled filter text (the "completion" re-open). */
    filter?: string;
}

export interface RofiResult {
    /** rofi's exit code: 0 accept / 10-13 custom / 1 cancel. */
    rc: number;
    /** The accepted entry ("" on cancel). */
    selection: string;
}

/**
 * Open a rofi dmenu over `entries` and resolve with the result. Blocks
 * while the menu is open (rofi is a child process, exactly like
 * split-launch's launcher phase). Never throws: a missing rofi or a
 * spawn failure resolves { rc: 1, selection: "" } — the cancel shape.
 */
export async function rofiMenu(
    { prompt, entries, filter }: RofiMenuOptions,
): Promise<RofiResult> {
    const theme = rofiThemePath();
    const argv = [
        "rofi", "-dmenu", "-i", "-p", prompt,
        ...(theme ? ["-theme", theme] : []),
        "-no-show-icons",
        "-no-auto-select",
        "-matching", "regex",
        // A character that can never be typed: an empty string would
        // disable the option but make rofi log a parse error per start.
        "-matching-negate-char", "\u0001",
        ...(filter ? ["-filter", filter] : []),
        "-kb-accept-alt", "",
        "-kb-accept-custom", "",
        "-kb-accept-custom-alt", "",
        "-kb-element-next", "",
        // Word-delete on the explicit bindings (default rofi only wires
        // Alt+BackSpace, which is easy to miss): Ctrl+BackSpace and
        // Alt+BackSpace both delete a whole word left of the caret.
        "-kb-remove-word-back", "Control+BackSpace,Alt+BackSpace",
        "-kb-custom-1", "Shift+Return",
        "-kb-custom-2", "Control+Shift+Return",
        "-kb-custom-3", "Tab",
        "-kb-custom-4", "Control+Return",
    ];
    try {
        const proc = Bun.spawn(argv, {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "inherit",
            env: spawnEnv(),
        });
        proc.stdin.write(`${entries.join("\n")}\n`);
        proc.stdin.end();
        const stdout = await new Response(proc.stdout).text();
        const rc = await proc.exited;
        return { rc, selection: stdout.trim() };
    } catch {
        return { rc: 1, selection: "" };
    }
}

/**
 * Run a command line in a floating temporary terminal (the palette's
 * Shift-Return behavior): the output is the point, and the terminal
 * never disturbs the tiling layout. Resolves the terminal's pid (for
 * the tracked help-terminals) or null when the spawn failed.
 */
export async function runInTerminal(commandLine: string): Promise<number | null> {
    const { launchTerminal } = await import("./terminal.js");
    return await launchTerminal({ command: commandLine, floating: true });
}
