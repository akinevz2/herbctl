// src/lib/lines.ts — the width-aware help helpers. Same contract as
// on-deploy's src/lib/lines.ts (the 2026-11 width contract: custom help
// surfaces wrap to the REAL terminal width), copied here rather than
// imported — the two repos share doctrine, not a package ref.
//
// NO_COPY (vs on-deploy): the usage-error group coloring. herbctl's
// emits stay PLAIN — the herbst side must not look like an error.
//
// Note bunli's own root/--help renderer bypasses this contract (it
// renders before any handler); the intercepted bare/help/--help path
// in src/index.ts renders OUR root surface with THESE helpers.

/** the render width: the terminal's column count, floored at 40 so
 *  narrow panes still flow; 80 when not a tty (no columns) */
export function helpWidth(): number {
    const cols = process.stdout.columns;
    return Math.max(40, typeof cols === "number" && cols > 0 ? cols : 80);
}

/** word-wrap to the width; an overlong single token hard-breaks */
export function wrapHelp(text: string, width = helpWidth()): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
        let line = "";
        const push = () => { if (line.length) { out.push(line); line = ""; } };
        for (const original of para.split(/\s+/).filter(Boolean)) {
            let word = original;
            // an overlong single token hard-breaks
            while (word.length > width) {
                push();
                out.push(word.slice(0, width));
                word = word.slice(width);
            }
            if (line.length === 0) line = word;
            else if (line.length + 1 + word.length <= width) line += " " + word;
            else { push(); line = word; }
        }
        push();
    }
    return out;
}

/** the usage + verb list: greedy two-per-line when the pair fits the
 *  width; otherwise one per line, each wrapped. Entries carry their
 *  `name<TAB>description`; the <TAB> gaps cue the terminal's column
 *  pairing. */
export function echoHelpList(module: string, usage: string, entries: string[]): void {
    const width = helpWidth();
    const emit = (line: string): void => console.log(`${module}:\t${line}`);
    emit(usage);
    for (let index = 0; index < entries.length;) {
        const pivot = entries[index]!;
        const next = entries[index + 1] ?? "";
        if (next !== "" && pivot.length + next.length + 2 < width) {
            emit(`${pivot}\t${next}`);
            index += 2;
        } else {
            for (const line of wrapHelp(pivot, width)) emit(line);
            index += 1;
        }
    }
}
