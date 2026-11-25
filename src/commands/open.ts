// src/commands/open.ts — THE palette verb: bare `herbctl open` is the
// command palette over the hlwm/shell helper scripts (the migrated
// hc_command); with a command argument it is the generic completion
// palette over that command's help.
//
//   herbctl open                       the command palette
//   herbctl open <command> [args...]   the completion palette
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
// The COMPLETION palette: `herbctl open <command> [typed-args...]` —
// for herbctl the levels come from the in-process completion registry
// (lib/completions — the SAME data `herbctl completions --internal`
// reports as JSON), no help-text scraping: the level's tokens and
// --flags open as a rofi menu, with the level's surface as a PERMANENT
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
//                     menu re-opens only AFTER the terminal closes
//                     (never on top of the help)
//   Ctrl-Shift-Return accept with output: the line runs in a floated
//                     temporary terminal (the output is the point)
//   Tab / Ctrl-Return descend: the selection is appended to the args
//                     and (for herbctl) the deeper level's surface
//                     replaces — single-level completions
//                     at a time, the replacing notification tracks the
//                     level
//   Escape            cancel
import { closeSync, openSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { rofiMenu, runInTerminal, spawnEnv } from "../lib/rofi.js";
import { pagerCmd } from "../lib/pager.js";
import { type VerbCompletions } from "../lib/completions.js";
import { spawnDetached } from "../lib/rule-spawn.js";
import { getCandidates, getTree, getVerb } from "../lib/completions.js";

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

/** markup-escape for dunst bodies (the shared convention). */
function escapeMarkup(s: string): string {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

/** Show a command's completion surface as a PERMANENT dunst
 *  notification (no timeout — it stays until dismissed/replaced) with
 *  a help ACTION: pressing the button opens the FULL `<command>
 *  --help` in a pager inside a floated temporary terminal. The body
 *  is synthesized from the completion registry (lib/completions) —
 *  terse, one screenful, no help-text scraping. Fail-soft: no
 *  dunstify, no dunst — no notification, no error. */
function notifyLevel(line: string, body: string): void {
    if (body.trim() === "") return;
    // Plain text, markup-escaped; capped so a huge help dump never
    // floods the screen (the pager action carries the full text).
    const escaped = escapeMarkup(body.trim());
    const pager = pagerCmd();
    const view = `${line} --help --format toon 2>&1 | ${pager}`;
    // The action waiter: dunstify blocks until the button is pressed
    // (printing the action key) or the notification is closed/replaced
    // (printing a close reason) — only the button press opens the
    // pager terminal. Detached: it outlives the palette.
    try {
        spawnDetached("sh", ["-c", helpActionScript(line, escaped, view, "low")]);
    } catch {
        // no dunstify/sh — the menu is the interface anyway
    }
}

/** The shared dunstify script: a PERMANENT notification with the help
 *  ACTION — pressing the button opens `<view>` (the full --help pager
 *  line) in a floated full-height terminal. `level` is the dunst
 *  urgency (low for level surfaces, critical for failures). */
function helpActionScript(
    title: string,
    escapedBody: string,
    view: string,
    level: string,
): string {
    return [
        `act=$(dunstify -a herbctl -r ${NOTIFY_ID} -u ${level} -t 0`
        + ` -A 'help,help' ${shQuote(title)} ${shQuote(escapedBody)})`,
        `[ "$act" = help ] && exec ${selfCmd()} terminal --floating`
        + ` --full-height ${shQuote(view)}`,
    ].join("\n");
}

/** SUBMIT a completed palette line, detached — but not blindly: the
 *  waiter captures the exit status, and a FAILURE (rc != 0 — a bare
 *  verbs-chain missing its required mode, an unknown flag…) raises a
 *  CRITICAL dunst notification carrying the command's help surface
 *  (the registry summary) with the same help ACTION. The line runs
 *  unquoted shell text by design (it may embed shell words). */
function submitLine(line: string, helpSummary: string): void {
    const view = `${line} --help --format toon 2>&1 | ${pagerCmd()}`;
    // The failure surface: the failing line, the error excerpt
    // (capped), then the help summary — all assembled shell-side
    // (the exit status exists only there).
    const script = [
        `err=$(${line} 2>&1); rc=$?`,
        `[ $rc -eq 0 ] && exit 0`,
        `excerpt=$(printf '%s' "$err" | head -c 500)`,
        `body=$(printf 'exit %s — %s\\n\\n%s' "$rc" "$excerpt" ${
            shQuote(escapeMarkup(helpSummary))
        })`,
        `act=$(dunstify -a herbctl -r ${NOTIFY_ID} -u critical -t 0`
        + ` -A 'help,help' ${shQuote(line)} "$body")`,
        `[ "$act" = help ] && exec ${selfCmd()} terminal --floating`
        + ` --full-height ${shQuote(view)}`,
    ].join("\n");
    try {
        spawnDetached("sh", ["-c", script]);
    } catch {
        // no dunstify/sh — the menu is the interface anyway
    }
}

/** The Tab resolution rule: Tab on a completion RESOLVES TO RUNNING
 *  (submit) rather than looping the token into the rofi filter, when
 *  the command is already complete:
 *   - a NON-FLAG token at the VERB level (args.length > 0) is a mode
 *     token — the deeper level only offers flags, so submitting is
 *     the only meaningful resolution;
 *   - otherwise the old tail rule: the token already appears among
 *     the next level's completions (a re-offered flag).
 *  At the ROOT level (args.length === 0) Tab on a verb DESCENDS —
 *  that is the completion palette's drill, never a submit. Pure, so
 *  the palette loop stays thin and the rule is testable. */
export function tabShouldSubmit(
    selection: string,
    argsLen: number,
    current: string[],
    next: string[],
): boolean {
    if (selection === "") return false;
    if (argsLen > 0 && !selection.startsWith("--")
        && current.includes(selection)) {
        return true;
    }
    return tabTailComplete(selection, next);
}

/** PURE: the Tab decision on a level with NO completions — a REQUIRED
 *  tail means the verb needs an argument (open the help); no tail
 *  declared means the verb takes nothing (execute). String-level,
 *  tested. */
export function tabOnEmptyDecision(
    tail?: { required?: boolean },
): "help" | "execute" {
    return tail?.required ? "help" : "execute";
}

/** The Tab tail short-circuit: when the token just Tab-completed
 *  ALREADY appears among the NEXT level's completions, the command is
 *  tail-complete — descending would re-offer the same verb (the
 *  collapsed verbs' usage enum re-appears at every level) and allow
 *  doubled tails like `float focus focus`. Tab resolves to RUNNING
 *  the line instead. Pure, so the palette loop stays thin and the
 *  rule is testable. */
export function tabTailComplete(tail: string, nextCompletions: string[]): boolean {
    return tail !== "" && nextCompletions.includes(tail);
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

/** The command-palette loop (bare `herbctl open`). */
async function commandPalette(): Promise<void> {
    const { rc, selection } = await rofiMenu({
        prompt: "command",
        entries: listCommands(),
    });
    if (selection === "") return; // Escape: nothing runs
    switch (rc) {
        case 12:
        case 13: // Tab / Ctrl-Return: herbctl drops into the completion
            // palette (its verbs/directions are completable); any OTHER
            // entry opens its --help in a FOCUSED floating window — the
            // user reads the parameters and dismisses (the previous
            // behavior descended into an empty completion menu: lost).
            if (selection === "herbctl") {
                await runPalette([selection]);
                return;
            }
            await runInTerminal(`${selection} --help --format toon 2>&1 | ${
                pagerCmd()
            }`);
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
            // a selection that is not on PATH cannot run — the dunst
            // callout says so (a detached `sh -c` failure is silent
            // and the user would never know)
            if (Bun.which(selection) === null) {
                Bun.spawnSync(
                    ["dunstify", "-a", "opencode-orchestrator", "orchestrator",
                     `command not found: ${selection}`],
                    { stdout: "ignore", stderr: "ignore" },
                );
                return;
            }
            spawnDetached("sh", ["-c", selection]);
            return;
        }
        default: // other customs: run silently, detached
            if (Bun.which(selection) !== null) {
                spawnDetached("sh", ["-c", selection]);
            } else {
                Bun.spawnSync(
                    ["dunstify", "-a", "opencode-orchestrator", "orchestrator",
                     `command not found: ${selection}`],
                    { stdout: "ignore", stderr: "ignore" },
                );
            }
            return;
    }
}

export default defineCommand({
    name: "open" as never,
    description: "the rofi WM command selector (the dynamic palette)",
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
 * The palette loop behind `herbctl open`, shared with `herbctl
 * command` (its Tab delegates single-command completion here). The
 * initial args are the command and whatever was typed ahead of the
 * first menu.
 */
/** Descend hard cap: each level appends one token, so a stuck
 *  selection loop can never grow args without bound (and re-enter a
 *  side-effectful command) — the menu just stops descending. */
const MAX_DESCEND = 8;

/** Resolve when the process exits (poll the pid liveness — the
 *  detached terminal is reaped by the runtime's SIGCHLD handler).
 *  Capped: a stuck terminal releases the menu after an hour. */
function waitForExit(pid: number): Promise<void> {
    return new Promise((resolve) => {
        let waited = 0;
        const timer = setInterval(() => {
            try {
                process.kill(pid, 0);
            } catch {
                clearInterval(timer);
                resolve();
                return;
            }
            waited += 200;
            if (waited >= 3_600_000) { // the fail-open cap
                clearInterval(timer);
                resolve();
            }
        }, 200);
    });
}

export async function runPalette(initial: string[]): Promise<void> {
    const [head, ...rest] = initial;
    if (!head) return; // nothing to complete
    // EVERY entry in this palette is the herbctl surface: the root
    // (head === "herbctl") completes the verb list; a verb head
    // completes that verb's tokens + flags.
    const isRoot = head === "herbctl";
    let args = isRoot ? rest : rest;
    const linePrefix = (): string[] =>
        isRoot ? ["herbctl", ...args] : ["herbctl", head, ...args];
    const verbFor = (): VerbCompletions | null =>
        isRoot ? getVerb(args[0] ?? "") : getVerb(head);
    // The Shift-Return pager help-terminals, tracked by pid: when the
    // rofi session ends they are closed and the help notification
    // dismissed — nothing outlives the palette.
    const pagerPids: number[] = [];
    const summaryFor = (a: string[]): string => {
        const v = isRoot ? getVerb(a[0] ?? "") : getVerb(head);
        if (v === null) return "";
        const modes = v.tokens.length > 0 ? `\nmodes: ${v.tokens.join(" ")}` : "";
        const flags = v.flags.length > 0 ? `\nflags: ${v.flags.join(" ")}` : "";
        return `${v.description}${modes}${flags}`;
    };
    try {
        while (args.length <= MAX_DESCEND) {
            // EVERY level shows the level's completion surface as a
            // dunst notification (replace-id'd) — from the in-process
            // registry (lib/completions), no subprocess, no scraping.
            const completions = isRoot
                ? getCandidates(args, "")
                : (() => {
                    const v = getVerb(head);
                    if (v === null) return [];
                    if (args.length > 0) return v.flags;
                    return [...v.tokens, ...v.flags];
                })();
            // the verb declares a tail parameter → the BLANK first
            // entry is offered: Tab/Enter on it accepts the line
            // AS-IS (the verb's blank semantics resolve it — e.g.
            // `tag --free` frees the focused tag)
            const verbSurface = getVerb(isRoot ? args[0] ?? "" : head);
            const blankEntry = verbSurface?.tail !== undefined
                ? "(leave empty)"
                : undefined;
            // An EMPTY level never opens a menu: submitting the line
            // lets the verb's own declarative layer prompt for the
            // missing required tail (the resilient userQuery) or run
            // the parameterless verb — the lost state is impossible.
            if (!isRoot && completions.length === 0 && args.length > 0) {
                submitLine(linePrefix().join(" "), summaryFor(args));
                break;
            }
            notifyLevel(linePrefix().join(" "), summaryFor(args));
            const { rc, selection } = await rofiMenu({
                prompt: linePrefix().join(" "),
                entries: completions,
                blankEntry,
            });
            if (selection === "" && !isRoot) break; // Escape on a verb level
            if (selection === "" && rc !== 0 && rc !== 12 && rc !== 13) break;
            const blankPicked = blankEntry !== undefined && selection === blankEntry;
            const line = linePrefix().join(" ");
            if (rc === 10) {
                // Shift-Return: the full help of the highlighted entry
                // in the help-terminal — NON-consuming, FOCUSED, the
                // same shape as Tab's help (runInTerminal: floating,
                // full frame height). The menu re-opens only AFTER the
                // terminal closes — rofi respawning immediately would
                // land on top of the pager and obscure it.
                const pid = await runInTerminal(
                    `${line} --help --format toon 2>&1 | ${pagerCmd()}`,
                );
                if (pid !== null) {
                    pagerPids.push(pid);
                    await waitForExit(pid);
                }
                continue;
            }
            if (rc === 11) {
                // Ctrl-Shift-Return: accept with output — the floated
                // temporary terminal (the output is the point);
                // deliberately UNTRACKED — it outlives the session.
                await runInTerminal(
                    [line, blankPicked ? "" : selection].filter(Boolean).join(" "),
                );
                break;
            }
            if (rc === 12 || rc === 13) {
                // Tab / Ctrl-Return: descend — UNLESS the level is
                // EMPTY (handled above at the next iteration's gate) or
                // the command is already complete (the tabShouldSubmit
                // rules): then the line RUNS.
                if (blankPicked) {
                    submitLine(linePrefix().join(" "), summaryFor(args));
                    break;
                }
                const next = [...args, selection].filter(Boolean);
                const nextCompletions = isRoot
                    ? getCandidates(next, "")
                    : (() => {
                        const v = next.length > 0 ? getVerb(next[0]) : null;
                        if (v === null) return [];
                        if (next.length > 1) return v.flags;
                        return [...v.tokens, ...v.flags];
                    })();
                if (tabShouldSubmit(selection, args.length, completions, nextCompletions)) {
                    submitLine(linePrefix().join(" ") + (selection ? ` ${selection}` : ""),
                        summaryFor(next));
                    break;
                }
                args = next;
                continue;
            }
            // Return (rc 0): submit the line with the typed/selected
            // token — or the assembled line when the menu was empty.
            const final = selection === "" || blankPicked
                ? linePrefix()
                : [...linePrefix(), selection];
            submitLine(final.join(" "), summaryFor(args));
            break;
        }
    } finally {
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
