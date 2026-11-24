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
//                     menu re-opens until the rofi session is done
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
import { launchTerminal } from "../lib/terminal.js";
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
    const pager = process.env.PAGER || "less -R";
    const view = `${line} --help 2>&1 | ${pager}`;
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
        `[ "$act" = help ] && exec ${selfCmd()} spawn terminal --floating`
        + ` ${shQuote(view)}`,
    ].join("\n");
}

/** SUBMIT a completed palette line, detached — but not blindly: the
 *  waiter captures the exit status, and a FAILURE (rc != 0 — a bare
 *  verbs-chain missing its required mode, an unknown flag…) raises a
 *  CRITICAL dunst notification carrying the command's help surface
 *  (the registry summary) with the same help ACTION. The line runs
 *  unquoted shell text by design (it may embed shell words). */
function submitLine(line: string, helpSummary: string): void {
    const view = `${line} --help 2>&1 | ${process.env.PAGER || "less -R"}`;
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
        `[ "$act" = help ] && exec ${selfCmd()} spawn terminal --floating`
        + ` ${shQuote(view)}`,
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

/** The command-palette loop (bare `herbctl run`). */
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
            await runInTerminal(`${selection} --help 2>&1 | ${
                process.env.PAGER || "less -R"
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
    description: "the command palette",
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
        // EVERY level — top level included — shows the level's
        // completion surface as a dunst notification (replace-id'd:
        // one notification at a time, always describing what the open
        // menu is over). The surface comes from the in-process
        // completion registry (lib/completions) — no subprocess, no
        // help-text scraping.
        const isHerbctl = cmd === "herbctl";
        // The level summary: the terse description + the mode tokens
        // and flags, one section per line (the notification body).
        const summaryFor = (a: string[]): string => {
            if (!isHerbctl) return ""; // non-herbctl: the empty menu
            if (a.length === 0) {
                return "herbctl <verb>\nverbs: "
                    + [...getTree().commands.map((c) => c.name)].join(" ");
            }
            const verb = getVerb(a[0]);
            if (verb === null) return ""; // not a verb: empty menu
            const modes = verb.tokens.length > 0
                ? `\nmodes: ${verb.tokens.join(" ")}`
                : "";
            const flags = verb.flags.length > 0
                ? `\nflags: ${verb.flags.join(" ")}`
                : "";
            return `${verb.description}${modes}${flags}`;
        };
        while (args.length <= MAX_DESCEND) {
            // The completion menu is for HERBCTL only: for any other
            // command there is no registry — those sessions open an
            // EMPTY menu — typing still completes the line, Return
            // submits it.
            notifyLevel([cmd, ...args].join(" "), summaryFor(args));
            const completions = isHerbctl ? getCandidates(args, "") : [];
            const { rc, selection } = await rofiMenu({
                prompt: [cmd, ...args].join(" "),
                entries: completions,
            });
            if (selection === "") break; // Escape: session over
            const line = [cmd, ...args, selection].join(" ");
            if (rc === 10) {
                // Shift-Return: the full help of the highlighted entry
                // in a pager terminal — NON-consuming (the menu
                // re-opens until the rofi session ends; the terminal
                // is tracked and closed on session end) and
                // NON-FOCUS-STEALING (the no-distract rule: the user
                // keeps working; the help is there when looked at).
                const pid = await launchTerminal({
                    command: `${line} --help 2>&1 | ${process.env.PAGER || "less -R"}`,
                    floating: true,
                    noDistract: true,
                    fullHeight: true,
                });
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
                // Tab: descend — UNLESS the command is already
                // complete, in which case Tab RESOLVES TO RUNNING the
                // line (the Return semantics): a mode token at the
                // verb level (the deeper level only offers flags), or
                // a tail the next level re-offers (the flag case).
                // Never a loop, never a doubled verb.
                const next = [...args, selection];
                const nextCompletions = isHerbctl
                    ? getCandidates(next, "")
                    : [];
                if (tabShouldSubmit(selection, args.length, completions, nextCompletions)) {
                    if (cmd !== "herbctl" || next.length > 0) {
                        submitLine([cmd, ...next].join(" "), summaryFor(next));
                    }
                    break;
                }
                if (completions.length === 0) {
                    // The level offers NOTHING — no subverbs, no flags
                    // known to the registry. The registry's TAIL FACT
                    // decides: a required tail means the verb needs an
                    // argument the menu cannot offer — Tab opens the
                    // verb's --help in a FOCUSED floating window so the
                    // user can read which parameters it accepts. No
                    // tail declared: the verb takes nothing — Tab
                    // executes the line as if Return was pressed.
                    const verb = getVerb(args[0] ?? "");
                    const line = [cmd, ...args].join(" ");
                    if (tabOnEmptyDecision(verb?.tail) === "help") {
                        const pid = await runInTerminal(
                            `${line} --help 2>&1 | ${process.env.PAGER || "less -R"}`,
                        );
                        if (pid !== null) pagerPids.push(pid);
                        continue; // the menu re-opens for the re-input
                    }
                    submitLine([cmd, ...args, selection].filter(Boolean).join(" "),
                        summaryFor(args));
                    break;
                }
                args = next;
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
                    submitLine(final.join(" "), summaryFor(args));
                }
                break;
            }
            // Other custom exits (rc 12+ unhandled): descend the same
            // way — the selection joins the args and the help re-runs.
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
