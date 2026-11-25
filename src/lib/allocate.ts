// src/lib/allocate.ts — the allocation machines behind the new/add
// verbs. Allocation semantics:
//
//   new <object>   allocate AND bring focus to the new object
//   add <object>   allocate with focus REMAINING on the current object
//   add --active   aliases to new
//
// Objects: frame, terminal, notification, tag. A tag IS an
// hlwm tag (create = `herbstclient add`, enter = `use`); the
// "workspace" word is banned everywhere. Notifications never take
// keyboard focus, so new/add are identical for them — the object is
// allocated (raised via dunst) and the focus semantics are vacuous.

import { hc, attr, helper, listClients } from "./hc.js";
import { newFrame } from "./chains.js";
import { launchTerminal } from "./terminal.js";
import { parseAttr } from "herbstutil/src/commands/parse.js";

/** pure: the tag index children of a `herbstclient attr tags.` reply
 *  (herbstutil's parseAttr; the trailing dot stripped — "0" "1" …
 *  "by-name" "focus"). */
export function tagIndexesFromDump(dump: string): string[] {
    const parsed = parseAttr(dump);
    return (parsed.children ?? []).map((c) => String(c).replace(/\.+$/, ""));
}

/** pure: the tag name out of a `herbstclient attr tags.<idx>.name`
 *  leaf reply (the raw value; undefined when the leaf errored — the
 *  empty index slots — or the name is empty). */
export function tagNameFromReply(reply: string): string | undefined {
    const name = reply.trim();
    return name === "" ? undefined : name;
}

/** pure: the tag names for a whole dump, the per-index name
 *  replies supplied by the caller (the herbstclient round trips stay
 *  at the call site). The focus/by-name mirror children repeat an
 *  existing name — deduped to one entry per tag. */
export function tagNames(
    dump: string,
    reply: (idx: string) => string,
): string[] {
    const names: string[] = [];
    for (const idx of tagIndexesFromDump(dump)) {
        const name = tagNameFromReply(reply(idx));
        if (name !== undefined && !names.includes(name)) names.push(name);
    }
    return names;
}

/** the hlwm tags on the current monitor (names) — `herbstclient attr
 *  tags.` parsed by herbstutil's parseAttr (the pure functions above),
 *  each index child's name read the same way (the empty index slots
 *  error and fail-soft to undefined). */
export async function listTags(): Promise<string[]> {
    const dump = (await hc("attr", "tags."))?.stdout;
    if (dump === undefined) return [];
    const replies = new Map<string, string>();
    for (const idx of tagIndexesFromDump(dump)) {
        const r = (await hc("attr", `tags.${idx}.name`))?.stdout;
        if (r !== undefined) replies.set(idx, r);
    }
    return tagNames(dump, (idx) => replies.get(idx) ?? "");
}

/** the tag exists, or it is allocated (the --on precondition). */
export async function ensureTag(name: string): Promise<boolean> {
    if ((await listTags()).includes(name)) return true;
    return (await hc("add", name)) !== null;
}

/** the smallest free numeric tag name (tags are the default 1..N
 *  naming; the first gap wins, else N+1). */
export async function freeTagName(): Promise<string> {
    const taken = new Set(await listTags());
    for (let i = 1; ; i += 1) {
        if (!taken.has(String(i))) return String(i);
    }
}

/** allocate a tag (hlwm tag). Returns the name, or null when hlwm
 *  refused (fail-soft). focus=true also `use`s it (the new semantics). */
export async function allocateTag(
    focus: boolean,
    name?: string,
): Promise<string | null> {
    const tag = name ?? (await freeTagName());
    const taken = new Set(await listTags());
    if (taken.has(tag)) {
        // exists already: allocation degenerates to entry
        if (focus) await hc("use", tag);
        return tag;
    }
    if ((await hc("add", tag)) === null) return null;
    if (focus) await hc("use", tag);
    return tag;
}

/** free (close) a tag: its clients move to the first other
 *  tag, then the tag merges away. Defaults to the FOCUSED one. */
export async function freeTag(name?: string): Promise<string | null> {
    const tag = name ?? (await attr("tags.focus.name"));
    if (tag === null || tag === "") return null;
    const others = (await listTags()).filter((t) => t !== tag);
    if (others.length === 0) return null; // the last tag never dies
    const target = others[0];
    for (const wid of await listClients({ tag })) {
        await hc("move", wid, target);
    }
    await hc("merge_tag", tag, target);
    return tag;
}

/** allocate a frame. focus=true cycles into the new frame (the new
 *  semantics — the migrated newFrame); focus=false splits and leaves
 *  focus on the current client (the add semantics — hlwm's bare split
 *  keeps the focused client focused). */
export async function allocateFrame(focus: boolean): Promise<void> {
    if (focus) return newFrame();
    await hc("split", "auto");
}

/** allocate a terminal. focus=true lets it take focus on attach (the
 *  default spawn); focus=false is the --no-distract rule (the migrated
 *  launch_alacritty machinery owns the once-rule). `on` attaches the
 *  terminal to a REMOTE tag (created when missing) with
 *  focus-stealing prevention: tag=<on> + focus=off + switchtag=off in
 *  the once-rule, and the previously focused client is re-focused after
 *  the attach in case hlwm moved focus anyway. Returns the pid. */
export async function allocateTerminal(
    focus: boolean,
    command?: string,
    opts: { on?: string; directory?: string } = {},
): Promise<number | null> {
    const prev = (await attr("clients.focus.winid")) ?? "";
    const pid = await launchTerminal({
        command: command ?? null,
        directory: opts.directory ?? null,
        noDistract: !focus,
        tag: opts.on ?? null,
    });
    if (opts.on) {
        // focus-stealing prevention, second line of defense: the
        // once-rule already carries focus=off + switchtag=off — if the
        // attach moved focus anyway, hand it straight back
        const now = (await attr("clients.focus.winid")) ?? "";
        if (prev !== "" && now !== "" && now !== prev) {
            await hc("jumpto", prev);
        }
    }
    return pid;
}

/** allocate a notification (raised via dunst). Notifications never take
 *  keyboard focus, so the new/add focus semantics are vacuous here —
 *  both allocate the same object. */
export async function allocateNotification(): Promise<boolean> {
    return helper("dunstify-input", ["herbctl: notification allocated"]);
}

/** dismiss the notifications (the close verb, notification object). */
export async function dismissNotifications(): Promise<boolean> {
    return helper("hc_dismiss-notifs");
}

/** close EVERY empty tag: the tags with no clients (the
 *  focused one excepted) merge into the first occupied one — the
 *  emptiness reads through herbstutil's typed tree (client_count). */
export async function closeEmptyTags(): Promise<string[]> {
    const closed: string[] = [];
    const tags = await listTags();
    let target: string | null = null;
    for (const tag of tags) {
        const count = Number(
            (await hc("attr", `tags.by-name.${tag}.client_count`))?.stdout ?? "1",
        );
        if (count > 0) {
            target = tag;
            break;
        }
    }
    if (target === null) return closed; // everything is empty: keep all
    for (const tag of tags) {
        if (tag === target) continue;
        const count = Number(
            (await hc("attr", `tags.by-name.${tag}.client_count`))?.stdout ?? "1",
        );
        if (count === 0) {
            if ((await hc("merge_tag", tag, target)) !== null) closed.push(tag);
        }
    }
    return closed;
}

/** close a frame: a focused client is closed and the frame removed
 *  (close_and_remove); an empty focused frame is removed outright. */
export async function closeFrame(): Promise<void> {
    const ff = (await attr("tags.focus.floating_focused")) ?? "false";
    if (ff === "true") {
        await hc("close");
        return;
    }
    await hc("or", ",", "close_and_remove", ",", "remove");
}
