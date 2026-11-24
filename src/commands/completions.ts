// src/commands/completions.ts — the completion data verb:
//
//   herbctl completions --bash       the bash completion script
//   herbctl completions --zsh        the zsh completion script
//   herbctl completions --fish       the fish completion script
//   herbctl completions --internal   the completion DATA as JSON
//
// The data itself lives in lib/completions.ts (the in-process
// registry index.ts fills at boot); this file is only the CLI
// surface and the shell delegate scripts.
//
// The shell scripts are thin delegates: they call back into
// `--internal` with the current words (--words) and the word being
// completed (--prefix), and the candidates come back as a compact
// JSON array — no jq, the identifiers are shell-safe
// (^[A-Za-z][\w-]*$ and --flags), so grep/tr unwraps them.
//
// The JSON contract (the herbctl-rofi command interface's data
// source):
//
//   { "name": "herbctl", "version": "…", "commands": [
//       { "name": "float", "description": "…",
//         "tokens": ["yank", "focus", …],      // the bare completions
//         "flags": ["--wid", "--target", …] }  // the option completions
//     … ] }
//
// `--internal --words <…> --prefix <p>` narrows to ONE level:
//   { "candidates": ["…", …] }
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { getCandidates, getTree } from "../lib/completions.js";

/** The bash delegate script (identifiers are shell-safe — the compact
 *  JSON is unwrapped with grep/tr only, no jq dependency: every quoted
 *  string is a candidate, the "candidates" key itself is dropped). */
export function bashScript(): string {
    return `# herbctl bash completion — delegates to 'herbctl completions --internal'
_herbctl_completions() {
    local cur
    local -a args=("\${COMP_WORDS[@]:1:COMP_CWORD-1}") req=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    ((\${#args[@]})) && req=(--words "\${args[@]}")
    mapfile -t COMPREPLY < <(
        herbctl completions --internal "\${req[@]}" --prefix "$cur" 2>/dev/null \\
            | grep -o '"[^"]*"' | tail -n +2 | tr -d '"'
    )
}
complete -F _herbctl_completions herbctl
`;
}

/** The zsh delegate script. */
export function zshScript(): string {
    return `#compdef herbctl
# herbctl zsh completion — delegates to 'herbctl completions --internal'
_herbctl() {
    local -a cand req
    local cur="\${words[CURRENT]}"
    local -a prev=("\${words[@]:1:$((CURRENT-1))}")
    (( $#prev )) && req=(--words $prev)
    cand=("\${(f)$(herbctl completions --internal $req --prefix $cur 2>/dev/null | grep -o '\"[^\"]*\"' | tail -n +2 | tr -d '\"')}")
    _describe 'herbctl' cand
}
compdef _herbctl herbctl
`;
}

/** The fish delegate script. */
export function fishScript(): string {
    return `# herbctl fish completion — delegates to 'herbctl completions --internal'
function _herbctl_completions
    set -l tokens (commandline -opc)[2..-1]
    set -l cur (commandline -ct)
    set -l req
    if test (count $tokens) -gt 0
        set req --words $tokens
    end
    set -l raw (herbctl completions --internal $req --prefix $cur 2>/dev/null \\
        | string match -ra '"[^"]*"')
    for item in $raw[2..-1]
        string replace -ra '"' '' -- $item
    end
end
complete -c herbctl -f -a '(_herbctl_completions)'
`;
}

const USAGE =
    "Usage: herbctl completions <[--bash|--zsh|--fish] | --internal [--words …] [--prefix p]>";

export default defineCommand({
    name: "completions" as never,
    description: "completions <bash|zsh|fish|internal>",
    options: {
        bash: option(z.boolean().default(false), {
            description: "print the bash completion script",
            argumentKind: "flag",
        }),
        zsh: option(z.boolean().default(false), {
            description: "print the zsh completion script",
            argumentKind: "flag",
        }),
        fish: option(z.boolean().default(false), {
            description: "print the fish completion script",
            argumentKind: "flag",
        }),
        internal: option(z.boolean().default(false), {
            description: "print the completion data as JSON",
            argumentKind: "flag",
        }),
        words: option(z.array(z.string()).default([]), {
            description: "internal: the completed words so far (repeatable)",
            repeatable: true,
        }),
        prefix: option(z.string().optional(), {
            description: "internal: the word being completed",
        }),
    },
    handler: async ({ flags }) => {
        const chosen = [
            flags.bash, flags.zsh, flags.fish, flags.internal,
        ].filter(Boolean).length;
        if (chosen !== 1) throw new Error(USAGE);
        if (flags.bash) {
            console.log(bashScript());
            return;
        }
        if (flags.zsh) {
            console.log(zshScript());
            return;
        }
        if (flags.fish) {
            console.log(fishScript());
            return;
        }
        // --internal: compact JSON — the shell delegates unwrap it
        // with grep/tr, indentation would only fight them. A --words/
        // --prefix presence (even --prefix "") is the QUERY shape; the
        // bare switch is the full tree.
        const query = flags.words.length > 0 || flags.prefix !== undefined;
        const payload = query
            ? { candidates: getCandidates(flags.words, flags.prefix ?? "") }
            : getTree();
        console.log(JSON.stringify(payload));
    },
});
