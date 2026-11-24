// src/lib/find.ts — the `find` machine: a needle resolves to a TAG
// first, else to CLIENT TITLES.
//
//   herbctl find <string>
//
//   1. a tag named <string> exists → `use` it (one herbstclient call —
//      the failure IS the miss, the fail-soft contract).
//   2. otherwise the needle is searched (case-insensitive substring)
//      in every managed client's title (the attr-tree read through
//      herbstutil — listClients + the title leaf).
//      - one match    → `jumpto` it (jumpto carries the tag switch)
//      - many matches → the rofi window switcher:
//          Return       focus the selected window, done
//          scroll up/down  focus the HIGHLIGHTED neighbor and reopen
//                       the SAME search (same filter, the new index
//                       pre-selected) — scroll-preview navigation:
//                       keep scrolling until the right entry, Return
//                       to finish on it
//          Escape       done
//
// The rofi loop relies on the scroll bindings being CUSTOM exits
// (-kb-custom-1/2 = ScrollUp/ScrollDown, the default ml-* scroll
// navigation cleared): scroll no longer moves the selection, it EXITS
// — the loop focuses idx±1 itself (wraparound) and reopens with
// -selected-row on it. Every reopen re-filters with the original
// needle, so the search context never drifts.

import { attrValue, hc, listClients } from "./hc.js";
import { rofiMenu } from "./rofi.js";

/** Usage line, thrown by the verb (the collapsed-verb convention). */
export const USAGE = "Usage: herbctl find <string>";

/** One switcher entry: what rofi shows, and which wid it resolves to. */
export interface FindEntry {
    /** The rofi line (title, wid-suffixed when titles collide). */
    text: string;
    /** The hlwm window id ("0x…"). */
    wid: string;
}

/** The window ids whose title contains the needle (case-insensitive),
 *  in the attr-tree order — the switcher entries. */
export async function titleMatches(needle: string): Promise<FindEntry[]> {
    const lower = needle.toLowerCase();
    const seen = new Map<string, number>(); // title → occurrence count
    const wids = await listClients();
    const found: { title: string; wid: string }[] = [];
    for (const wid of wids) {
        const title = await attrValue<string>(`clients.${wid}.title`);
        if (title === null) continue; // vanished between listing and read
        if (!title.toLowerCase().includes(lower)) continue;
        seen.set(title, (seen.get(title) ?? 0) + 1);
        found.push({ title, wid });
    }
    // Duplicate titles are wid-suffixed so every entry resolves
    // uniquely; singles stay clean.
    return found.map(({ title, wid }) => ({
        wid,
        text: (seen.get(title) ?? 0) > 1 ? `${title} (${wid})` : title,
    }));
}

/** Resolve a rofi selection back to its wid: an exact entry text, or
 *  the "(0x…)" suffix of a wid-suffixed duplicate. Null when the
 *  selection is typed text with no exact entry (refusal — the loop
 *  just closes; the search string is the interface, not free text). */
export function selectionWid(
    selection: string,
    entries: FindEntry[],
): string | null {
    const suffix = selection.match(/^(.*) \((0x[0-9a-fA-F]+)\)$/);
    if (suffix && entries.some((e) => e.text === selection)) {
        return suffix[2];
    }
    return entries.find((e) => e.text === selection)?.wid ?? null;
}

/** `jumpto` — focus a window, carrying the tag switch. Fail-soft. */
async function jumpto(wid: string): Promise<void> {
    await hc("jumpto", wid);
}

/** The full find machine. See the file head. */
export async function findMachine(needle: string): Promise<void> {
    if (needle === "") throw new Error(USAGE);

    // 1. the tag shortcut: `use` succeeds exactly when the tag exists
    //    (and switches to it in the same call).
    if ((await hc("use", needle)) !== null) return;

    // 2. the title search.
    const entries = await titleMatches(needle);
    if (entries.length === 0) return; // nothing anywhere — quietly done
    if (entries.length === 1) {
        await jumpto(entries[0].wid);
        return;
    }

    // 3. the switcher loop (scroll-preview navigation).
    const texts = entries.map((e) => e.text);
    let idx = 0;
    for (;;) {
        const { rc, selection } = await rofiMenu({
            prompt: "find",
            entries: texts,
            filter: needle,
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
