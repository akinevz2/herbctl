// src/lib/args.ts — the DECLARATIVE argument layer. Every verb declares
// its parameters as data at the top of its source file (the single
// source of truth — argument-time verbs are separated from the actual
// parameters); resolution walks the spec:
//
//   1. the tail-position arguments name things: the Nth tail spec
//      consumes the Nth positional
//   2. a specified value wins
//   3. an omitted optional takes its default (or stays absent)
//   4. an omitted REQUIRED is prompted for:
//        a. the themed rofi input query (input.rasi — a single-argument
//           string query entry, optionally a choice list)
//        b. no rofi/display: an URGENT, focus-stealing floating
//           terminal that closes on submission
//        c. no terminal possible (headless): the command FAILS with
//           `argument <a> is required for <verb [sub]>` and exit 2 —
//           the detectable shape for orchestration/automation
//           (opencode-orchestrate): the reason string doubles as the
//           quick documentation pointer (`herbctl help <verb>`).
//
// The parse functions are pure and string-level: spec + argv in,
// values/reason out — tested against the real argument shapes.

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rofiMenu, rofiInputThemePath } from "./rofi.js";
import { launchTerminal } from "./terminal.js";
import { hc } from "./hc.js";

export interface ArgSpec {
    /** the parameter name (tail position order = declaration order) */
    name: string;
    /** what it names — shown in the prompt and the failure reason */
    description: string;
    /** required: omitted → prompt, then the fail shape */
    required?: boolean;
    /** used when omitted and not required */
    default?: string;
    /** the rofi prompt title (default: the argument name) */
    promptTitle?: string;
    /** fixed choices: the prompt becomes a themed rofi LIST query */
    entries?: string[];
    /** return an error reason to reject a supplied/prompted value */
    validate?: (value: string) => string | undefined;
    /** the parameter names an hlwm OBJECT KIND: the prompt's entries
     *  are indexed LIVE from herbstutil/hc (never free-form) */
    source?: "tags" | "clients";
    /** the blank-parameter semantics — a FUNCTIONAL FACT, declared:
     *   "current"  blank refers to the CURRENT (focused) object — the
     *              prompt offers it as the first entry and the verb
     *              never asks twice
     *   "input"    blank requires user input — the prompt is mandatory
     *  Declared per verb; the audit lives in AGENTS.md. */
    blank?: "current" | "input";
}

export interface ArgResolution {
    /** name → value (omitted optionals are absent) */
    values: Record<string, string>;
    /** the name of the first required argument left unresolved (the
     *  fail shape), or null */
    missing: string | null;
}

export const ARG_EXIT = 2;
export function argFailReason(name: string, verb: string): string {
    return `argument ${name} is required for ${verb}`;
}

/** PURE: pair the tail positionals with the specs in order and resolve
 *  values/defaults. Returns the per-arg values plus the list of
 *  required names still missing (the caller owns prompting/failing). */
export function resolveTails(
    specs: readonly ArgSpec[],
    positional: readonly string[],
): ArgResolution {
    const values: Record<string, string> = {};
    const missing: string[] = [];
    specs.forEach((spec, i) => {
        const supplied = positional[i]?.trim();
        if (supplied) {
            values[spec.name] = supplied;
            return;
        }
        if (spec.default !== undefined) {
            values[spec.name] = spec.default;
            return;
        }
        if (spec.required) missing.push(spec.name);
    });
    return { values, missing: missing[0] ?? null };
}

/** the CURRENT object per live source — the "blank means the focused
 *  one" resolution (the focused tag name / the focused client). */
export async function currentObject(
    source: NonNullable<ArgSpec["source"]>,
): Promise<string | null> {
    if (source === "tags") {
        const r = await hc("attr", "tags.focus.name");
        return r === null ? null : r.stdout.trim();
    }
    const r = await hc("attr", "clients.focus.winid");
    return r === null ? null : r.stdout.trim();
}

/** the LIVE prompt entries for a source (herbstutil/hc-indexed, never
 *  free-form), with the current-object entry FIRST when the blank
 *  semantics is "current". */
export async function promptEntries(spec: ArgSpec): Promise<string[]> {
    if (spec.entries) return [...spec.entries];
    if (spec.source === "tags") {
        const { listTags } = await import("./allocate.js");
        const tags = await listTags();
        if (spec.blank === "current") {
            const current = await currentObject("tags");
            if (current) return [`(focused) ${current}`, ...tags.filter((t) => t !== current)];
        }
        return tags;
    }
    if (spec.source === "clients") {
        const { listClients } = await import("./hc.js");
        return listClients();
    }
    return [];
}

/** map a prompt selection back to the VALUE (the "(focused) name"
 *  entry resolves to the focused object's name). */
export async function entryValue(
    spec: ArgSpec,
    selection: string,
): Promise<string | undefined> {
    if (selection.startsWith("(focused) ")) {
        return (await currentObject(spec.source ?? "tags")) ?? undefined;
    }
    return selection;
}

/** the themed rofi INPUT query: a single-argument string entry over the
 *  input.rasi capture theme (entries turn it into a choice list).
 *  Resolves null on cancel. */
export async function rofiInput(
    title: string,
    entries: readonly string[] = [],
    filter = "",
): Promise<string | null> {
    const { rc, selection } = await rofiMenu({
        prompt: title,
        entries: [...entries],
        filter: filter || undefined,
        theme: rofiInputThemePath() ?? undefined,
    });
    // Tab (kb-custom-3, rc 12) CONFIRMS the typed input — the user's
    // expectation when finishing a free-text entry; 10/13 accept too.
    if (rc !== 0 && rc !== 10 && rc !== 12 && rc !== 13) return null;
    return selection;
}

/** the urgent, focus-stealing terminal input: a floating terminal that
 *  prompts for the value and CLOSES on submission. Resolves the answer
 *  (null on cancel/timeout — the terminal never lingers). */
export async function terminalInput(
    title: string,
    timeoutMs = 120_000,
): Promise<string | null> {
    const dir = mkdtempSync(join(tmpdir(), "herbctl-arg."));
    const answer = join(dir, "answer");
    // ESC-aware input: Escape aborts WITHOUT writing the answer (the
    // terminal closes, the caller sees the fail shape); Enter submits.
    const script =
        `bash -ic 'a=""; while IFS= read -rsn1 k; do case "$k" in "") break ;; $'\\e') exit 1 ;; esac; a+="$k"; done; printf %s "$a" > ${shellQ(answer)}'`;
    const pid = await launchTerminal({ command: script, floating: true, urgent: true });
    if (pid === null) {
        rmSync(dir, { force: true, recursive: true });
        return null;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
        if (existsSync(answer)) {
            const value = readFileSync(answer, "utf8").trim();
            rmSync(dir, { force: true, recursive: true });
            return value === "" ? null : value;
        }
    }
    rmSync(dir, { force: true, recursive: true });
    return null;
}

function shellQ(s: string): string {
    return `'${s.replaceAll("'", `'\\''`)}'`;
}

/** the verb-level resolution: tail specs + the positional tail, with
 *  the interactive prompt chain for missing required arguments. Resolves
 *  null when a required argument is still missing — the caller exits
 *  ARG_EXIT after printing argFailReason (already on stderr). */
export async function resolveVerbArgs(
    verb: string,
    sub: string | undefined,
    specs: readonly ArgSpec[],
    positional: readonly string[],
): Promise<Record<string, string> | null> {
    const { values, missing } = resolveTails(specs, positional);
    if (missing === null) return values;
    const spec = specs.find((s) => s.name === missing);
    if (!spec) return values;
    const label = [verb, sub].filter(Boolean).join(" ");
    // the blank-parameter semantics: "current" — blank refers to the
    // CURRENT (focused) object, resolved silently, no prompt, no fail
    if (spec.blank === "current" && spec.source) {
        const current = await currentObject(spec.source);
        if (current !== null) return { ...values, [missing]: current };
    }
    const value = await promptValue(spec, label);
    if (value === null) {
        console.error(argFailReason(missing, label));
        return null;
    }
    return { ...values, [missing]: value };
}

export function promptBackends(env: {
    display?: string;
    rofiOnPath: boolean;
    wmSpawnPossible: boolean;
    noPrompt?: boolean;
}): Array<"rofi" | "terminal"> {
    if (env.noPrompt) return [];
    const backends: Array<"rofi" | "terminal"> = [];
    if (env.display && env.rofiOnPath) backends.push("rofi");
    if (env.wmSpawnPossible) backends.push("terminal");
    return backends;
}

export async function promptValue(
    spec: ArgSpec,
    verb: string,
): Promise<string | null> {
    const title = spec.promptTitle ?? `${verb}: ${spec.name} (${spec.description})`;
    const backends = promptBackends({
        display: process.env.DISPLAY,
        rofiOnPath: Bun.which("rofi") !== null,
        wmSpawnPossible: true,
        noPrompt: process.env.HERBCTL_NO_PROMPT === "1",
    });
    // the live entries: resolved ONCE per prompt (herbstutil/hc-indexed
    // when the spec declares a source; the current-object entry first
    // when the blank semantics is "current")
    const entries = await promptEntries(spec);
    // the FIRST AVAILABLE backend only — a user cancellation is a
    // refusal (the fail shape), never a cascade into the next backend
    const backend = backends[0];
    if (backend === undefined) return null;
    for (;;) {
        const selected =
            backend === "rofi"
                ? await rofiInput(title, entries)
                : await terminalInput(title);
        if (selected === null) return null; // the user refused: the fail shape
        const value = await entryValue(spec, selected);
        if (value === undefined) break;
        const problem = spec.validate?.(value);
        if (problem === undefined) return value;
        if (backend === "rofi") {
            await rofiMenu({ prompt: problem, entries: [] });
        } else {
            console.error(`herbctl: ${problem} — prompting again`);
        }
    }
    return null;
}
