// src/lib/find.ts — the `find` machine: bare, the GLOBAL WINDOW
// SELECTOR; with a needle, the needle resolves to a TAG first, else
// it PRE-FILLS the selector's rofi filter.
//
//   herbctl find              the global window selector
//   herbctl find <string>
//
// BARE: every managed window, one rofi entry apiece, carrying the
// four facts that matter for choosing:
//   [title] · [tag] · minimized? · floating?
// (the title leads so typing filters on it). Enter focuses the
// selected window (jumpto — carries the tag switch), scroll
// up/down focuses the PREVIOUS/NEXT window in the list and reopens
// the selector on it, Escape closes.
//
// WITH A NEEDLE:
//   1. a tag named <string> exists → `use` it (one herbstclient call —
//      the failure IS the miss, the fail-soft contract).
//   2. otherwise the FULL entry list opens with the needle as the
//      rofi filter (pre-typed): rofi's own matching selects the
//      window — no pre-filtering here, the input is a FILTER, never
//      a row one would have to type out.
//
// The rofi loop relies on the scroll bindings being CUSTOM exits
// (-kb-custom-1/2 = ScrollUp/ScrollDown, the default ml-* scroll
// navigation cleared): scroll no longer moves the selection, it EXITS
// — the loop focuses idx±1 itself (wraparound) and reopens with
// -selected-row on it. Every reopen re-filters with the original
// needle, so the search context never drifts.

import { asBool, attrValue, hc, listClients } from "./hc.js";
import { rofiMenu } from "./rofi.js";

/** Usage line, thrown by the verb (the collapsed-verb convention). */
export const USAGE = "Usage: herbctl find [string]";

/** One selector entry: the window's four facts, and what rofi shows. */
export interface FindEntry {
    /** The hlwm window id ("0x…"). */
    wid: string;
    /** The client title. */
    title: string;
    /** The tag the window lives on. */
    tag: string;
    /** Minimized (hidden) state. */
    min: boolean;
    /** Floating state. */
    floating: boolean;
}

/** The rofi line: title leads (the filter target), then tag, then the
 *  state markers — the four facts of the selector contract. */
export function entryText(e: FindEntry): string {
    const states = [
        e.tag,
        ...(e.min ? ["minimized"] : []),
        ...(e.floating ? ["floating"] : []),
    ];
    return [e.title, ...states].join(" · ");
}

/** Read one window's four facts; null when it vanished mid-scan. */
async function windowFacts(wid: string): Promise<FindEntry | null> {
    const [title, tag, min, floating] = await Promise.all([
        attrValue<string>(`clients.${wid}.title`),
        attrValue<string>(`clients.${wid}.tag`),
        attrValue<string>(`clients.${wid}.minimized`),
        attrValue<string>(`clients.${wid}.floating`),
    ]);
    if (title === null) return null;
    return {
        wid,
        title,
        tag: tag ?? "?",
        min: asBool(min),
        floating: asBool(floating),
    };
}

/** Every managed window's facts, in the attr-tree order. */
export async function allEntries(): Promise<FindEntry[]> {
    const entries: FindEntry[] = [];
    for (const wid of await listClients()) {
        const e = await windowFacts(wid);
        if (e !== null) entries.push(e);
    }
    return entries;
}

/** Resolve a rofi selection back to its wid: an exact match against
 *  the RENDERED entry lines (the same rendering the menu showed —
 *  wid-suffixed when titles collide). Null when the selection is
 *  typed text with no exact entry (refusal — the loop just closes;
 *  the search string is the interface, not free text). */
export function selectionWid(
    selection: string,
    entries: FindEntry[],
): string | null {
    const idx = entryLines(entries).indexOf(selection);
    return idx === -1 ? null : entries[idx].wid;
}

/** Duplicate titles are wid-suffixed so every entry resolves
 *  uniquely; singles stay clean. */
export function entryLines(entries: FindEntry[]): string[] {
    const seen = new Map<string, number>(); // title → occurrence count
    for (const e of entries) seen.set(e.title, (seen.get(e.title) ?? 0) + 1);
    return entries.map((e) => {
        const text = entryText(e);
        return (seen.get(e.title) ?? 0) > 1 ? `${text} (${e.wid})` : text;
    });
}

/** `jumpto` — focus a window, carrying the tag switch. Fail-soft. */
async function jumpto(wid: string): Promise<void> {
    await hc("jumpto", wid);
}

/** The switcher loop (scroll-preview navigation) over pre-built
 *  entries; `filter` pre-types the needle (empty for the bare
 *  selector). */
async function selectorLoop(
    entries: FindEntry[],
    filter: string,
): Promise<void> {
    const texts = entryLines(entries);
    let idx = 0;
    for (;;) {
        const { rc, selection } = await rofiMenu({
            prompt: "find",
            entries: texts,
            filter,
            selectedRow: idx,
            scroll: "exit",
        });
        if (rc === 0) {
            // Return: focus the selected window, done.
            const wid = selectionWid(selection, entries);
            if (wid !== null) await jumpto(wid);
            return;
        }
        if (rc === 10 || rc === 11) {
            // Scroll: focus the neighbor (wraparound), reopen on it.
            idx = (idx + (rc === 10 ? -1 : 1) + entries.length)
                % entries.length;
            await jumpto(entries[idx].wid);
            continue;
        }
        return; // Escape / spawn failure / anything else: done
    }
}

/** The full find machine. See the file head. */
export async function findMachine(needle: string): Promise<void> {
    // BARE: the global window selector — every window, no filter.
    if (needle === "") {
        const entries = await allEntries();
        if (entries.length === 0) return; // nothing managed — quietly done
        await selectorLoop(entries, "");
        return;
    }

    // 1. the tag shortcut: `use` succeeds exactly when the tag exists
    //    (and switches to it in the same call).
    if ((await hc("use", needle)) !== null) return;

    // 2. the selector with the needle as the pre-filled rofi filter —
    //    the FULL list, rofi's own matching does the selecting.
    const entries = await allEntries();
    if (entries.length === 0) return; // nothing managed — quietly done
    await selectorLoop(entries, needle);
}
