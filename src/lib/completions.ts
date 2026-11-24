// src/lib/completions.ts — THE completion data source: the in-process
// registry of the registered commands (index.ts calls
// registerCompletions once at boot), typed into
//
//   { name, version, commands: [{ name, description, tokens, flags }] }
//
// …and consumed by BOTH surfaces that used to scrape `--help` text
// (the removed captureHelp pathway):
//   - `herbctl completions --internal` (the herbctl-rofi JSON feed)
//   - the run palette (`herbctl run`), which now reads its levels
//     straight from the same registry — no subprocess, no parsing
//
// tokens come from the terse descriptions' usage enums ("<a|b|c>" and
// "[a|b|c]" — the collapsed verbs declare their modes there, one
// source, no re-derivation); flags come from the commands' option
// definitions. Placeholder enums (<string>, [name], <dir>) are NOT
// completions — the PLACEHOLDERS stoplist filters them.
import { version } from "../../package.json" with { type: "json" };

export interface TailSpec {
    /** the tail parameter's name ("name" for the tagspace verbs) */
    name: string;
    /** required: omitted, the verb PROMPTS (rofi input, then the urgent
     *  terminal) and fails with the argument-required shape when the
     *  prompt is refused */
    required?: boolean;
    description: string;
}

/** a flag scoped to ONE mode token of a collapsed verb (--empty lives
 *  under close's tagspace mode; --on/--directory under new/add's
 *  terminal) — the registry carries the relation so the completions
 *  offer the flag ONLY where it applies. */
export interface ModeFlag {
    flag: string;
    description: string;
}

export interface VerbCompletions {
    name: string;
    description: string;
    tokens: string[];
    flags: string[];
    /** the flag descriptions (the tree printer annotates with them) */
    flagDescriptions?: Record<string, string>;
    /** the tail parameter fact, when the verb takes one (the declarative
     *  ARGS layer feeds this — the Tab rule asks the registry instead of
     *  scraping --help text) */
    tail?: TailSpec;
    /** the mode-scoped flags, per mode token */
    modeFlags?: Record<string, ModeFlag[]>;
}

export interface CompletionsTree {
    name: string;
    version: string;
    commands: VerbCompletions[];
}

/** Common help-section headings that are never completions (the old
 *  parseHelpCompletions STOP set, kept for the description rows). */
const STOP = new Set([
    "usage", "options", "commands", "subcommands", "arguments", "flags",
    "examples", "description", "version", "help", "global", "synopsis",
    "available", "notes", "environment",
]);

/** Enum slots that name a TYPE the user fills in, not a mode to
 *  select. Not completions. */
const PLACEHOLDERS = new Set([
    "string", "name", "dir", "path", "wid", "text", "object",
]);

/** The mode tokens declared in a usage/description string: the
 *  "<a|b|c>" and "[a|b|c]" enum slots (hyphens included — or-remove),
 *  filtered to bare word-shaped tokens minus the placeholders. */
export function enumTokens(text: string): string[] {
    const seen = new Set<string>();
    for (const slot of text.matchAll(/[<\[]([\w|-]+)[>\]]/g)) {
        for (const token of slot[1].split("|")) {
            if (!/^[A-Za-z][\w-]*$/.test(token)) continue;
            if (PLACEHOLDERS.has(token) || STOP.has(token)) continue;
            seen.add(token);
        }
    }
    return [...seen];
}

/** The completion registry, filled once at boot by index.ts. */
const registry = new Map<string, VerbCompletions>();

/** Register the command definitions (the same array index.ts hands
 *  cli.command): name + description verbatim, tokens derived from the
 *  description's usage enums, flags from the option definitions. */
export function registerCompletions(
    commands: Array<{
        name: string;
        description: string;
        options?: Record<string, unknown>;
    }>,
    tails: Record<string, TailSpec> = {},
    modeFlags: Record<string, Record<string, ModeFlag[]>> = {},
): void {
    for (const command of commands) {
        if (STOP.has(command.name.toLowerCase())) continue;
        const scoped = modeFlags[command.name] ?? {};
        const scopedAll = new Set(
            Object.values(scoped).flatMap((mfs) => mfs.map((mf) => mf.flag)),
        );
        const flags: string[] = [];
        const flagDescriptions: Record<string, string> = {};
        for (const [key, opt] of Object.entries(command.options ?? {})) {
            if (opt && typeof opt === "object") {
                const flag = `--${key}`;
                if (!scopedAll.has(flag)) flags.push(flag);
                const d = (opt as { description?: string }).description;
                if (d) flagDescriptions[flag] = d;
            }
        }
        registry.set(command.name, {
            name: command.name,
            description: command.description,
            tokens: enumTokens(command.description)
                .filter((t) => t !== command.name),
            flags,
            flagDescriptions,
            tail: tails[command.name],
            modeFlags: Object.keys(scoped).length > 0 ? scoped : undefined,
        });
    }
}

/** The full tree (the --internal JSON feed). */
export function getTree(): CompletionsTree {
    return {
        name: "herbctl",
        version,
        commands: [...registry.values()],
    };
}

/** One verb's surface, or null when the name is not a verb. */
export function getVerb(name: string): VerbCompletions | null {
    return registry.get(name) ?? null;
}

/** The completion candidates at ONE position: the root verbs when
 *  args is empty; the verb's tokens + flags at its level; flags only
 *  once a mode token is consumed; everything filtered by the prefix.
 *  Unknown names yield nothing (the old palette's empty menu). */
export function getCandidates(
    args: string[],
    prefix: string,
): string[] {
    if (args.length === 0) {
        return [...registry.keys()].filter((n) => n.startsWith(prefix));
    }
    const [head, ...rest] = args;
    const verb = getVerb(head);
    if (verb === null) return []; // not a verb — nothing to offer
    if (rest.length > 0) {
        // the mode-scoped flags join the verb flags ONCE their mode
        // token is consumed (--empty appears under close's tagspace)
        const mode = rest.find((t) => verb.modeFlags?.[t] !== undefined);
        const scoped = mode !== undefined
            ? (verb.modeFlags?.[mode] ?? []).map((mf) => mf.flag)
            : [];
        return [
            ...scoped,
            ...verb.flags.filter((f) => f.startsWith(prefix)),
        ].filter((f) => f.startsWith(prefix));
    }
    // the verb level: the UNSCOPED flags only — a mode-scoped flag
    // completes at its own mode's level (the tree shows the relation)
    return [
        ...verb.tokens.filter((t) => t.startsWith(prefix) && t !== head),
        ...verb.flags.filter((f) => f.startsWith(prefix)),
    ];
}
