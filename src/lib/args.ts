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
    if (rc !== 0) return null;
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
    const script =
        `bash -ic 'read -r -p "${title}: " a && printf %s "$a" > ${shellQ(answer)}'`;
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
    for (const backend of backends) {
        for (;;) {
            const value =
                backend === "rofi"
                    ? await rofiInput(title, spec.entries ?? [])
                    : await terminalInput(title);
            if (value === null) break; // this backend could not gather — next one
            const problem = spec.validate?.(value);
            if (problem === undefined) return value;
            if (backend === "rofi") {
                await rofiMenu({ prompt: problem, entries: [] });
            } else {
                console.error(`herbctl: ${problem} — prompting again`);
            }
        }
    }
    return null;
}
