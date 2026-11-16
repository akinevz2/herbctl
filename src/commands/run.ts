// src/commands/run.ts — the generic completion palette:
//
//   herbctl run <command> [typed-args...]
//
// The machine runs `<command> <args> --help` (falling back to
// `<command> <args> help`), parses the completion tokens out of the
// help text — the indented subcommands AND the --flags — and opens a
// rofi menu over them. From there:
//
//   Return            accept: the assembled `<command> <args>`
//                     line runs SILENTLY (detached, output discarded)
//                     — the command-palette convention; a WM verb
//                     submitted this way must not leave a parked
//                     terminal behind
//   Ctrl-Shift-Return accept with output: the line runs in a floated
//                     temporary terminal (the output is the point)
//   Shift-Return / Tab / Ctrl-Return
//                   descend: the selection is appended to the args and
//                   the machine re-runs the help of the deeper command
//                   (the input is pre-filled with the selection) —
//                   single-level completions at a time; the deeper
//                   command's help text also shows up as a dunst
//                   notification (replacing the previous one)
//   Escape          cancel
//
// hc_command is the motivating consumer: the bare `herbctl run
// herbctl` menu IS the single-level command palette, and each
// Shift-Return descends one level. A failed help capture (the deeper
// command has no help, or the command does not exist) re-opens the
// menu over an empty list — typing still completes the line with
// Return.
import { defineCommand } from "@bunli/core";

import { rofiMenu, runInTerminal, spawnEnv } from "../lib/rofi.js";
import { spawnDetached } from "../lib/rule-spawn.js";

/** The dunstify replace id: repeated Tab descends REPLACE the help
 *  notification instead of stacking a pile of them. */
const NOTIFY_ID = "47110";

/** Show a command's help text as a dunst notification (the Tab
 *  companion: descending now SHOWS what the next level contains).
 *  Fail-soft: no dunstify, no dunst — no notification, no error. */
function notifyHelp(line: string, text: string): void {
    if (text.trim() === "") return;
    // Plain text, markup-escaped; capped so a huge help dump never
    // floods the screen (the menu itself carries the completions).
    const escape = (s: string) =>
        s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    let body = escape(text.trim())
        .split("\n").slice(0, 40).join("\n");
    if (body.length > 2500) body = `${body.slice(0, 2500)}\n…`;
    try {
        spawnDetached("dunstify", [
            "-a", "herbctl",
            "-r", NOTIFY_ID,
            "-u", "low",
            line,
            body,
        ]);
    } catch {
        // no dunstify installed — the menu is the interface anyway
    }
}

/** Common help-section headings that are never completions. */
const STOP = new Set([
    "usage", "options", "commands", "subcommands", "arguments", "flags",
    "examples", "description", "version", "help", "global", "synopsis",
    "available", "notes", "environment",
]);

/**
 * Extract the completion tokens from a help text: the EXACTLY
 * two-space indented bare words at the start of a line (the section
 * entry indentation of every CLI help shape: bunli, cobra, clap) plus
 * the long flags in those same entry lines. Deeper indentation is
 * deliberately ignored — it is wrapped description prose (a --force
 * mentioned mid-sentence is not a completion).
 */
export function parseHelpCompletions(text: string): string[] {
    const seen = new Set<string>();
    for (const line of text.split("\n")) {
        const entry = line.match(/^ {2}([A-Za-z][\w:-]*)\s/);
        if (entry && !STOP.has(entry[1].toLowerCase())) seen.add(entry[1]);
        for (const flag of line.matchAll(/^ {2,4}(--[A-Za-z][\w-]*)/g)) {
            seen.add(flag[1]);
        }
    }
    return [...seen];
}

/** Capture `<cmd> <args> --help`, with a `--format toon` plain-text
 *  override for bunli-style CLIs and a bare `help` subcommand fallback
 *  for CLIs without --help.
 *
 *  SAFETY: the bare `help` fallback only ever runs at the TOP level
 *  (empty args): at deeper levels `<cmd> <args> help` can be a real
 *  execution — for `herbctl terminal` the positional args ARE a
 *  command string, so every fallback call would spawn a terminal
 *  (the nested-alacritty spawn loop of 2026-11-16). The --help shapes
 *  short-circuit to help output in bunli and are always safe; the
 *  fallback only fires when they yielded NOTHING, and only once.
 *
 *  The variant that parses into the MOST completions wins. Resolves
 *  "" on any failure — the caller re-opens an empty menu instead of
 *  wedging. */
const HELP_VARIANTS: string[][] = [
    ["--help"],
    ["--format", "toon", "--help"],
    ["help"],
];

async function captureHelp(cmd: string, args: string[]): Promise<string> {
    let best = "";
    let bestCount = -1;
    for (const suffix of HELP_VARIANTS) {
        // The bare `help` subcommand: top level only (see SAFETY note).
        if (args.length > 0 && suffix[0] === "help") continue;
        let text = "";
        try {
            const proc = Bun.spawn([cmd, ...args, ...suffix], {
                stdout: "pipe",
                stderr: "pipe",
                env: spawnEnv(),
                timeout: 5000,
            });
            const [out, err] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
            ]);
            await proc.exited;
            text = `${out}\n${err}`;
        } catch {
            continue; // try the next shape
        }
        const count = parseHelpCompletions(text).length;
        if (count > bestCount) {
            best = text;
            bestCount = count;
        }
        if (bestCount > 0) break; // a good help capture — stop early
    }
    return best;
}

export default defineCommand({
    name: "run" as never,
    description: "Rofi completion palette over a command's help; Shift-Return descends",
    handler: async ({ positional }) => {
        const [cmd = "", ...initial] = positional;
        if (cmd === "") {
            throw new Error("Usage: herbctl run <command> [typed-args...]");
        }
        await runPalette([cmd, ...initial]);
    },
});

/**
 * The palette loop behind `herbctl run`, shared with `herbctl
 * command` (its Tab delegates single-command completion here). The
 * initial args are the command and whatever was typed ahead of the
 * first menu.
 */
/** Descend hard cap: each level appends one token, so a stuck
 *  selection loop can never grow args without bound (and re-enter a
 *  side-effectful command) — the menu just stops descending. */
const MAX_DESCEND = 8;

export async function runPalette(initial: string[]): Promise<void> {
    const [cmd, ...initialArgs] = initial;
    if (!cmd) return; // nothing to complete
    let args = initialArgs;
    // The FIRST menu is the palette itself — its help surface is the
    // entry list. Every DESCEND (Shift-Return / Tab / Ctrl-Return)
    // additionally shows the deeper command's help via dunstify.
    let descended = false;
    while (args.length <= MAX_DESCEND) {
        const help = await captureHelp(cmd, args);
        if (descended) {
            notifyHelp([cmd, ...args].join(" "), help);
        }
        const completions = parseHelpCompletions(help);
        const { rc, selection } = await rofiMenu({
            prompt: [cmd, ...args].join(" "),
            entries: completions,
        });
        if (selection === "") return; // Escape: nothing runs
        const line = [cmd, ...args, selection].join(" ");
        if (rc === 11) {
            // Ctrl-Shift-Return: accept with output — the floated
            // temporary terminal (the output is the point here).
            await runInTerminal(line);
            return;
        }
        if (rc === 0) {
            // Return: accept SILENTLY — detached, output discarded
            // (the command-palette convention; a WM verb submitted
            // this way leaves no parked terminal behind).
            spawnDetached("sh", ["-c", line]);
            return;
        }
        // Shift-Return / Tab / Ctrl-Return: descend one level —
        // the selection joins the args and the help re-runs.
        args = [...args, selection];
        descended = true;
    }
}
