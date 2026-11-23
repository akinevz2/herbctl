// src/lib/allocate.ts — the allocation machines behind the new/add
// verbs. Allocation semantics:
//
//   new <object>   allocate AND bring focus to the new object
//   add <object>   allocate with focus REMAINING on the current object
//   add --active   aliases to new
//
// Objects: frame, terminal, notification, tagspace. A tagspace IS an
// hlwm tag (create = `herbstclient add`, enter = `use`); the
// "workspace" word is banned everywhere. Notifications never take
// keyboard focus, so new/add are identical for them — the object is
// allocated (raised via dunst) and the focus semantics are vacuous.

import { hc, attr, helper, listClients } from "./hc.js";
import { newFrame } from "./chains.js";
import { launchTerminal } from "./terminal.js";

/** the hlwm tags on the current monitor (names). */
export async function listTagspaces(): Promise<string[]> {
    const r = await hc("list_tags");
    if (r === null) return [];
    // list_tags prints one name per line (each possibly a quoted path —
    // bare names for the default naming)
    return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** the tagspace exists, or it is allocated (the --on precondition). */
export async function ensureTagspace(name: string): Promise<boolean> {
    if ((await listTagspaces()).includes(name)) return true;
    return (await hc("add", name)) !== null;
}

/** the smallest free numeric tagspace name (tags are the default 1..N
 *  naming; the first gap wins, else N+1). */
export async function freeTagspaceName(): Promise<string> {
    const taken = new Set(await listTagspaces());
    for (let i = 1; ; i += 1) {
        if (!taken.has(String(i))) return String(i);
    }
}

/** allocate a tagspace (hlwm tag). Returns the name, or null when hlwm
 *  refused (fail-soft). focus=true also `use`s it (the new semantics). */
export async function allocateTagspace(
    focus: boolean,
    name?: string,
): Promise<string | null> {
    const tag = name ?? (await freeTagspaceName());
    const taken = new Set(await listTagspaces());
    if (taken.has(tag)) {
        // exists already: allocation degenerates to entry
        if (focus) await hc("use", tag);
        return tag;
    }
    if ((await hc("add", tag)) === null) return null;
    if (focus) await hc("use", tag);
    return tag;
}

/** free (close) a tagspace: its clients move to the first other
 *  tagspace, then the tag merges away. Defaults to the FOCUSED one. */
export async function freeTagspace(name?: string): Promise<string | null> {
    const tag = name ?? (await attr("tags.focus.name"));
    if (tag === null || tag === "") return null;
    const others = (await listTagspaces()).filter((t) => t !== tag);
    if (others.length === 0) return null; // the last tagspace never dies
    const target = others[0];
    for (const wid of await listClients({ tag })) {
        await hc("move", wid, target);
    }
    await hc("merge_tag", tag, target);
    return tag;
}

/** enter a tagspace (the focus verb). */
export async function focusTagspace(name?: string): Promise<boolean> {
    const tag = name ?? (await freeTagspaceName());
    return (await hc("use", tag)) !== null;
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
 *  terminal to a REMOTE tagspace (created when missing) with
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

/** focus a terminal client: the most recently attached alacritty-class
 *  client is jumped to (nothing focused matches -> no-op, fail-soft). */
export async function focusTerminal(): Promise<boolean> {
    const wids = await listClients();
    if (wids.length === 0) return false;
    const r = await hc("chain", ",", "jumpto", wids[wids.length - 1]);
    return r !== null;
}
