// src/lib/commandTree.ts — the FULL verb/parameter structure of herbctl,
// printed by `herbctl --command-tree`: every verb, its usage tokens, its
// tail parameter fact, and its flags — with the MODE-SCOPED relation
// annotated (a flag that lives under one mode token is shown there, not
// at the verb level). The string-level builder is pure: the completions
// tree + the tail/mode-flag facts in, text out — tested.

import { type CompletionsTree, type TailSpec, type ModeFlag } from "./completions.js";

export function commandTreeText(
    tree: CompletionsTree,
    tails: Record<string, TailSpec>,
    modeFlags: Record<string, Record<string, ModeFlag[]>>,
): string {
    const lines: string[] = [];
    lines.push(`${tree.name} v${tree.version} — the command tree`);
    lines.push("");
    for (const command of tree.commands) {
        const usage = command.tokens.length > 0
            ? `${command.name} <${command.tokens.join("|")}>`
            : `${command.name} [options]`;
        lines.push(usage);
        lines.push(`    ${command.description}`);
        const tail: TailSpec | undefined = tails[command.name];
        if (tail) {
            lines.push(`    tail: ${tail.name} — ${tail.description}`
                + (tail.required
                    ? " (REQUIRED; prompted when omitted)"
                    : " (blank = the focused one)"));
        }
        const scoped: Record<string, ModeFlag[]> = modeFlags[command.name] ?? {};
        const scopedAll = new Set(
            Object.values(scoped).flatMap((mfs) => mfs.map((mf) => mf.flag)),
        );
        const unscoped = command.flags.filter((f) => !scopedAll.has(f));
        if (unscoped.length > 0) {
            lines.push(`    flags: ${unscoped.join(" ")}`);
        }
        for (const [mode, mfs] of Object.entries(scoped)) {
            lines.push(`    ${mode}: ${mfs.map((mf) => `${mf.flag} (${mf.description})`).join(" ")}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
