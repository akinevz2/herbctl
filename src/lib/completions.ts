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

export interface VerbCompletions {
    name: string;
    description: string;
    tokens: string[];
    flags: string[];
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
): void {
    for (const command of commands) {
        if (STOP.has(command.name.toLowerCase())) continue;
        const flags: string[] = [];
        for (const [key, opt] of Object.entries(command.options ?? {})) {
            if (opt && typeof opt === "object") flags.push(`--${key}`);
        }
        registry.set(command.name, {
            name: command.name,
            description: command.description,
            tokens: enumTokens(command.description)
                .filter((t) => t !== command.name),
            flags,
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
        return verb.flags.filter((f) => f.startsWith(prefix));
    }
    return [
        ...verb.tokens.filter((t) => t.startsWith(prefix) && t !== head),
        ...verb.flags.filter((f) => f.startsWith(prefix)),
    ];
}
