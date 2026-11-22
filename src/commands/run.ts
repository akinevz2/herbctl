// src/commands/run.ts — THE palette verb: bare `herbctl run` is the
// command palette over the hlwm/shell helper scripts (the migrated
// hc_command); with a command argument it is the generic completion
// palette over that command's help.
//
//   herbctl run                       the command palette
//   herbctl run <command> [args...]   the completion palette
//
// The COMMAND palette: every PATH executable whose name starts with
// one of the PREFIXES (rofi_, hc_, hlwm) in a rofi dmenu styled like
// the app launcher, herbctl PINNED at the top. Selection handling:
//
//   Return              FINISH OR DESCEND: commands whose help has
//                       completions (herbctl, the WM verbs) drop into
//                       the completion palette; plain scripts run
//                       silently, as always
//   Shift-Return        run in a floated temporary terminal
//   Ctrl-Shift-Return   same, with --help appended
//   Tab / Ctrl-Return   Tab-completing a SINGLE command: the selection
//                       is handed to the completion palette (runPalette)
//   Escape              cancelled, nothing runs
//
// The COMPLETION palette: `herbctl run <command> [typed-args...]` —
// the machine runs `<command> <args> --help` (falling back to
// `<command> <args> help`), parses the completion tokens out of the
// help text — the indented subcommands AND the --flags — and opens a
// rofi menu over them, showing the SAME help text as a PERMANENT
// dunst notification at every level (top level included, replace-id'd:
// one notification at a time, no timeout — it stays until dismissed).
// The notification carries a help ACTION (dunstify button): pressing
// it spawns a floated terminal showing the FULL `<command> --help`
// through a pager. From there:
//
//   Return            SUBMIT: the line with the typed/selected token,
//                     or the assembled line when the menu was empty —
//                     runs SILENTLY (detached, output discarded; a WM
//                     verb submitted this way leaves no parked
//                     terminal behind). No probing — drilling is
//                     Tab's job.
//   Shift-Return      the full help of the highlighted entry in a
//                     floated pager terminal — NON-consuming: the
//                     menu re-opens until the rofi session is done
//   Ctrl-Shift-Return accept with output: the line runs in a floated
//                     temporary terminal (the output is the point)
//   Tab / Ctrl-Return descend: the selection is appended to the args
//                     and (for herbctl) the machine re-runs the help
//                     of the deeper command — single-level completions
//                     at a time, the replacing notification tracks the
//                     level
//   Escape            cancel
import { closeSync, openSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { rofiMenu, runInTerminal, spawnEnv } from "../lib/rofi.js";
import { spawnDetached } from "../lib/rule-spawn.js";

/** Which executable name prefixes the command palette lists. */
const PREFIXES = ["rofi_", "hc_", "hlwm"];

/** The dunstify replace id: every level REPLACES the help notification
 *  instead of stacking a pile of them. */
const NOTIFY_ID = "47110";

/** shell-quote for the waiter script (single-quote wrapping). */
function shQuote(s: string): string {
    return `'${s.replaceAll("'", "'\\''")}'`;
}

/** The herbctl binary as callable from the detached waiter script. */
function selfCmd(): string {
    return Bun.which("herbctl") ?? process.execPath;
}

/** Show a command's help text as a PERMANENT dunst notification (no
 *  timeout — it stays until dismissed/replaced) with a help ACTION:
 *  pressing the button opens the FULL `<command> --help` in a pager
 *  inside a floated temporary terminal. Fail-soft: no dunstify, no
 *  dunst — no notification, no error. */
function notifyHelp(line: string, text: string): void {
    if (text.trim() === "") return;
    // Plain text, markup-escaped; capped so a huge help dump never
    // floods the screen (the pager action carries the full text).
    const escape = (s: string) =>
        s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    let body = escape(text.trim())
        .split("\n").slice(0, 40).join("\n");
    if (body.length > 2500) body = `${body.slice(0, 2500)}\n…`;
    const pager = process.env.PAGER || "less -R";
    const view = `${line} --help 2>&1 | ${pager}`;
    // The action waiter: dunstify blocks until the button is pressed
    // (printing the action key) or the notification is closed/replaced
    // (printing a close reason) — only the button press opens the
    // pager terminal. Detached: it outlives the palette.
    const script = [
        `act=$(dunstify -a herbctl -r ${NOTIFY_ID} -u low -t 0`
        + ` -A 'help,help' ${shQuote(line)} ${shQuote(body)})`,
        `[ "$act" = help ] && exec ${selfCmd()} spawn terminal --floating`
        + ` ${shQuote(view)}`,
    ].join("\n");
    try {
        spawnDetached("sh", ["-c", script]);
    } catch {
        // no dunstify/sh — the menu is the interface anyway
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
 * entry indentation of every CLI help shape: bunli, cobra, clap), the
 * long flags in those same entry lines, AND the <a|b|c> enum slots in
 * usage lines — the collapsed verbs (jump/shift/frame) declare their
 * directions there, and the palette must index them.
 * Deeper indentation is deliberately ignored — it is wrapped
 * description prose (a --force mentioned mid-sentence is not a
 * completion).
 */
export function parseHelpCompletions(text: string): string[] {
    const seen = new Set<string>();
    for (const line of text.split("\n")) {
        const entry = line.match(/^ {2}([A-Za-z][\w:-]*)\s/);
        if (entry && !STOP.has(entry[1].toLowerCase())) seen.add(entry[1]);
        for (const flag of line.matchAll(/^ {2,4}(--[A-Za-z][\w-]*)/g)) {
            seen.add(flag[1]);
        }
        for (const slot of line.matchAll(/<([\w|]+)>/g)) {
            for (const token of slot[1].split("|")) {
                if (/^[A-Za-z][\w-]*$/.test(token)) seen.add(token);
            }
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
        // Serialized-JSON help is NEVER a menu source: it parses into
        // completions only by accident (the <a|b|c> slots inside the
        // text field), and it displays as a JSON blob in the help
        // notification. The toon variant carries the same help as
        // plain text.
        const trimmed = text.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) continue;
        const count = parseHelpCompletions(text).length;
        if (count > bestCount) {
            best = text;
            bestCount = count;
        }
        if (bestCount > 0) break; // a good help capture — stop early
    }
    return best;
}

/** One find pass over the PATH dirs (the command palette's
 *  enumeration); deduped, herbctl pinned. */
function listCommands(): string[] {
    const dirs = new Set<string>([`${process.env.HOME}/.local/bin`]);
    // Split on colon ONLY: entries contain spaces ("Program Files").
    for (const dir of (process.env.PATH ?? "").split(":")) {
        if (dir === "" || dir.startsWith("/mnt/")) continue;
        dirs.add(dir);
    }
    const nameTests = PREFIXES.flatMap((p, i) =>
        i === 0 ? ["-name", `${p}*`] : ["-o", "-name", `${p}*`],
    );
    try {
        const proc = Bun.spawnSync(
            [
                "find", "-L", ...dirs,
                "-maxdepth", "1", "-type", "f", "-executable",
                "(", ...nameTests, ")", "-printf", "%f\n",
            ],
            { env: spawnEnv() },
        );
        const found = proc.stdout.toString().split("\n");
        // herbctl heads the palette when it resolves — fail-soft.
        const pinned = Bun.which("herbctl") ? ["herbctl"] : [];
        return [...pinned, ...new Set(found.filter(Boolean))];
    } catch {
        return Bun.which("herbctl") ? ["herbctl"] : [];
    }
}

/** Single-instance lock for the palette (key repeat or a double-press
 *  must NEVER stack two rofi windows). O_EXCL create; a lock older
 *  than 15 s is stale (a killed process) and gets stolen. */
function acquireLock(): { release(): void } | null {
    const path = `${tmpdir()}/herbctl-command.lock`;
    try {
        if (Date.now() - statSync(path).mtimeMs < 15_000) return null;
        rmSync(path);
    } catch {
        // no lock file (or it vanished between stat and rm) — create
    }
    try {
        const fd = openSync(path, "wx");
        return {
            release() {
                try {
                    rmSync(path);
                } catch {
                    // already gone
                }
                closeSync(fd);
            },
        };
    } catch {
        return null; // held by another palette
    }
}

/** The command-palette loop (bare `herbctl run`). */
async function commandPalette(): Promise<void> {
    const { rc, selection } = await rofiMenu({
        prompt: "command",
        entries: listCommands(),
    });
    if (selection === "") return; // Escape: nothing runs
    switch (rc) {
        case 12:
        case 13: // Tab / Ctrl-Return: hand the single command to the
            // completion palette — run IS the single-level completion
            // implementation (Tab descends, Shift-Return pagers).
            await runPalette([selection]);
            return;
        case 10: // Shift-Return: run in the floated terminal
            await runInTerminal(selection);
            return;
        case 11: // Ctrl-Shift-Return: same, with --help appended
            await runInTerminal(`${selection} --help`);
            return;
        case 0: { // Return: LAUNCH — silently, detached, immediately.
            // The ONLY drill-down is the pinned herbctl head (whose
            // verbs/directions are completable): the first Return
            // drops into the verb list. Everything else — plain
            // scripts like hc_config-save — launches right here:
            // probing a script's "help" would EXECUTE it, and the
            // drill-down never converges on execution output.
            if (selection === "herbctl") {
                await runPalette([selection]);
                return;
            }
            spawnDetached("sh", ["-c", selection]);
            return;
        }
        default: // other customs: run silently, detached
            spawnDetached("sh", ["-c", selection]);
            return;
    }
}

export default defineCommand({
    name: "run" as never,
    description: "palette: bare = helper scripts, <command> = completions",
    options: {
        extra: option(z.array(z.string()).default([]), {
            description: "command palette: extra name prefixes (repeatable)",
            short: "p",
            repeatable: true,
        }),
    },
    handler: async ({ positional, flags }) => {
        // Bare: the command palette (single-instance locked).
        if (positional.length === 0) {
            const lock = acquireLock();
            if (!lock) return; // a palette is already up
            try {
                await commandPalette();
            } finally {
                lock.release();
            }
            return;
        }
        const [cmd, ...initial] = positional;
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
    // The Shift-Return pager help-terminals, tracked by pid: when the
    // rofi session ends (submit, cancel, Escape) they are closed and
    // the help notification dismissed — nothing outlives the palette.
    const pagerPids: number[] = [];
    try {
        // EVERY level — top level included — shows its command's help
        // as a dunst notification (replace-id'd: one notification at a
        // time, always describing what the open menu is over).
        while (args.length <= MAX_DESCEND) {
            // The help capture + completion menu is for HERBCTL only:
            // for any other command the "help" capture EXECUTES the
            // command (--help / help are not conventions scripts
            // honor), and its output is execution result, not a
            // completion surface. Those sessions open an EMPTY menu —
            // typing still completes the line, Return submits it.
            const isHerbctl = cmd === "herbctl";
            const help = isHerbctl ? await captureHelp(cmd, args) : "";
            if (isHerbctl) {
                notifyHelp([cmd, ...args].join(" "), help);
            }
            const completions = parseHelpCompletions(help);
            const { rc, selection } = await rofiMenu({
                prompt: [cmd, ...args].join(" "),
                entries: completions,
            });
            if (selection === "") break; // Escape: session over
            const line = [cmd, ...args, selection].join(" ");
            if (rc === 10) {
                // Shift-Return: the full help of the highlighted entry
                // in a floated pager terminal — NON-consuming: the
                // menu re-opens until the rofi session is done; the
                // terminal is tracked and closed on session end.
                const pid = await runInTerminal(`${line} --help 2>&1 | ${
                    process.env.PAGER || "less -R"
                }`);
                if (pid !== null) pagerPids.push(pid);
                continue;
            }
            if (rc === 11) {
                // Ctrl-Shift-Return: accept with output — the floated
                // temporary terminal (the output is the point here);
                // deliberately UNTRACKED — it outlives the session.
                await runInTerminal(line);
                break;
            }
            if (rc === 12) {
                // Tab: ALWAYS descend (explicit exploration) — the
                // selection joins the args, the help re-runs, the
                // notification replaces.
                args = [...args, selection];
                continue;
            }
            if (rc === 0 || rc === 13) {
                // Return and Ctrl-Return BOTH submit: the line with the
                // typed/selected token, or the assembled line when the
                // menu was empty (an empty selection must not swallow
                // the launch). No probing — drilling is Tab's job.
                const final = selection === ""
                    ? [cmd, ...args]
                    : [cmd, ...args, selection];
                if (final.length > 1 || cmd !== "herbctl") {
                    spawnDetached("sh", ["-c", final.join(" ")]);
                }
                break;
            }
            // Tab (rc 12): descend — the selection joins the args and
            // (for herbctl) the help re-runs.
            args = [...args, selection];
        }
    } finally {
        // Session over: the pager terminals close (SIGTERM to the
        // alacritty process closes the window), and the help
        // notification is dismissed — dunstify's waiter exits with it.
        for (const pid of pagerPids) {
            try {
                process.kill(pid, "SIGTERM");
            } catch {
                // already gone
            }
        }
        spawnDetached("dunstctl", ["close", NOTIFY_ID]);
    }
}
