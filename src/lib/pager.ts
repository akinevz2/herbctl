// src/lib/pager.ts — the pager line used inside help terminals.
//
// bat first (the apt adapter ships `batcat`; `bat` when present):
// DEFAULT STYLING — line numbers, decorations, highlighting — and
// `--paging=always`, so the text renders in the alternate screen
// FROM THE TOP, re-renders in place on resize, and the terminal
// STAYS OPEN on a short dump (less's "renders at the bottom then
// jumps to the top after a resize" and its instant-exit-on-one-page
// are exactly what bat avoids here). `less -R` is the fallback, and
// any $PAGER override wins. Resolve at call time: callers spawn
// detached shells.

/** The pager command for help surfaces (bat-first, less fallback). */
export function pagerCmd(): string {
    if (process.env.PAGER) return process.env.PAGER;
    const bat = Bun.which("bat") ?? Bun.which("batcat");
    return bat !== null ? `${bat} --paging=always` : "less -R";
}
