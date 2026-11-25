// src/lib/hidden.ts — the hidden (minimized) windows picker, migrated
// from polyframes `hidden` (itself the port of the former dots
// rofi_hidden). The mod-g machine:
//
//   no hidden clients     the windows switcher, focused EXCLUDED
//                         (the in-tree `herbctl windows` menu — the
//                         polyframes windows delegation is gone); when
//                         the only
//                         unminimized window IS the focused one there is
//                         nothing to switch to — minimize it instead
//                         (the hc_minimize idiom)
//   exactly one hidden    no menu — revealed directly (bring + raise +
//                         unfloat)
//   more                  the rofi script-mode menu of hidden windows
//                         (window-switcher.rasi, urgent/hidden styling,
//                         MRU order): Enter/left click = bring (follows
//                         the window to its tag), right click = jumpto
//                         (unminimize + focus); every action quits.

import { spawnSync } from "node:child_process";
import {
    asBool, asString, attrTree, attrValue, hc, helperDir,
} from "./hc.js";
import { spawnEnv } from "./rofi.js";
import { ui } from "./debug.js";
import {
    ROFI_RETV, launchRofi, menuOpt, modeSpec, row,
} from "./rofi-script.js";

const SWITCHER_THEME = `${process.env.HOME}/.config/rofi/window-switcher.rasi`;

interface ClientRow {
    wid: string;
    cls: string;
    min: boolean;
    tg: string;
    ttl: string;
}

/**
 * One round trip per window via herbstutil's attr-tree interface
 * (the polyframes clientFields shape, migrated onto herbctl's hc
 * layer); falls back to parallel plain attr reads when the tree read
 * fails. Returns null when the client vanished.
 */
async function clientRow(wid: string): Promise<ClientRow | null> {
    const tree = await attrTree(`clients.${wid}.`);
    if (tree) {
        const a = tree.attributes;
        const w = asString(a.winid);
        if (!w) {
            ui("hidden: vanished client %s (attr tree)", wid);
            return null;
        }
        return {
            wid: w,
            cls: asString(a.class) ?? "",
            min: asBool(a.minimized),
            tg: asString(a.tag) ?? "",
            ttl: asString(a.title) ?? "",
        };
    }
    // Plain-attr fallback (tree read failed).
    const [w, cls, min, tg, ttl] = await Promise.all([
        attrValue<string>(`clients.${wid}.winid`),
        attrValue<string>(`clients.${wid}.class`),
        attrValue<boolean>(`clients.${wid}.minimized`),
        attrValue<string>(`clients.${wid}.tag`),
        attrValue<string>(`clients.${wid}.title`),
    ]);
    if (!w) return null;
    return {
        wid: w,
        cls: cls ?? "",
        min: min === true,
        tg: tg ?? "",
        ttl: ttl ?? "",
    };
}

/** Tag names in hlwm's own order (tag_status order, no markers). */
async function tagOrder(): Promise<string[]> {
    const r = await hc("tag_status");
    if (r === null) return [];
    const tags: string[] = [];
    for (const entry of r.stdout.split(/\s+/)) {
        if (!entry) continue;
        const name = /^[\.\!\+\:\#]/.test(entry[0]) ? entry.slice(1) : entry;
        if (name !== "") tags.push(name);
    }
    return tags;
}

/** All managed wids, one `attr clients.` tree round trip. */
async function allClientWids(): Promise<string[]> {
    const tree = await attrTree("clients.");
    if (!tree) return [];
    return tree.children.filter((c) => /^0x[0-9a-f]+$/i.test(c));
}

/**
 * Pure-hlwm window ordering approximating "most recently used first":
 * focused window, then the focused tag (WM order), then all other tags
 * (tag_status order) — the polyframes windowOrder shape, migrated.
 */
async function windowOrder(): Promise<string[]> {
    const [wids, focused, focusTag] = await Promise.all([
        allClientWids(),
        attrValue<string>("clients.focus.winid"),
        attrValue<string>("tags.focus.name"),
    ]);

    if (!focused) {
        // No focused window: plain tag-grouped WM order everywhere.
        const tags = await tagOrder();
        const rows = (await Promise.all(wids.map(clientRow)))
            .filter((o): o is ClientRow => o !== null);
        return tags.map((t) => rows.filter((o) => o.tg === t).map((o) => o.wid)).flat();
    }

    const head = [focused];
    const rest = wids.filter((w) => w !== focused);

    const mapped = (await Promise.all(rest.map(clientRow)))
        .map((r, i) => ({ r, wid: rest[i] }))
        .filter((x): x is { r: ClientRow; wid: string } => x.r !== null);

    // Focused tag first, then the other tags in order.
    const tags = await tagOrder();
    const orderedTags = focusTag
        ? [focusTag, ...tags.filter((t) => t !== focusTag)]
        : tags;
    const byTag = new Map<string, string[]>();
    for (const { r, wid } of mapped) {
        const list = byTag.get(r.tg) ?? [];
        list.push(wid);
        byTag.set(r.tg, list);
    }
    const out: string[] = [...head];
    for (const t of orderedTags) {
        out.push(...(byTag.get(t) ?? []));
    }
    ui("hidden: window order %d windows", out.length);
    return out;
}

/** MRU first; only minimized clients; rows numbered 1..n. Exported for
 *  tests (the row count decides the picker's branch). */
export async function hiddenRows(): Promise<string> {
    let i = 0;
    let out = "";
    for (const wid of await windowOrder()) {
        const f = await clientRow(wid);
        if (!f) continue;
        if (!f.min) continue;
        i += 1;
        const disp = `${String(i).padStart(2, " ")}. ${f.ttl || f.cls}`;
        // No icon metadata: the theme collapses element-icon to size 0
        // ("we have no icons"), and rofi still LOADED the class-name
        // icons when a field was present — tripping the GDK pixbuf
        // width assertion and a GObject unref assertion on cleanup.
        // Same urgent row markup as the windows menu.
        out += row(disp, "urgent", "true", "info", f.wid);
    }
    ui("hidden: %d hidden rows", i);
    return out;
}

/**
 * Reveal ONE window directly (exactly one hidden — no menu needed):
 * bring + raise + unfloat, the polyframes revealWid chain.
 */
async function revealWid(wid: string): Promise<void> {
    await hc("chain", ",", "bring", wid, ",", "raise", wid, ",",
        "attr", `clients.${wid}.floating`, "off");
}

/**
 * The no-hidden branch: when the only unminimized window is the focused
 * one there is nothing to switch to — minimize it; otherwise delegate
 * to the WINDOWS menu — the in-tree all-but-focused switcher (the
 * migrated polyframes windows; the fallback is its own verb now).
 */
async function spawnWindowsFallback(): Promise<never> {
    await windowsMenu();
    process.exit(0);
}

/**
 * The WINDOWS switcher (the migrated polyframes windows): every
 * visible (non-minimized) window EXCLUDING the focused one, MRU order.
 * Launcher mode: exec rofi in script mode; backend: rows on rev 0,
 * bring on rev 1, jumpto on rev 10 (right-click).
 */
export async function windowsMenu(): Promise<void> {
    const rev = ROFI_RETV();
    if (rev === undefined) {
        await launchRofi([
            "-show", "windows",
            "-modi", modeSpec("windows", ["windows"]),
            "-theme", SWITCHER_THEME,
            "-auto-select",
            "-kb-custom-1", "MouseSecondary",
        ], ["windows"]);
    }

    switch (rev) {
        case "0": // initial call: emit the visible-window rows
            process.stdout.write(menuOpt("use-hot-keys", "true"));
            process.stdout.write(menuOpt("prompt", "windows"));
            process.stdout.write(menuOpt("no-custom", "true"));
            process.stdout.write(await windowsRows());
            break;
        case "1": // accepted a row: bring (follows the window to its tag)
            await hc("bring", process.env.ROFI_INFO ?? "");
            break;
        case "10": // right-click hot-key: jumpto (focus in place)
            await hc("jumpto", process.env.ROFI_INFO ?? "");
            break;
    }
}

/** MRU order; only VISIBLE clients; the focused one EXCLUDED. */
async function windowsRows(): Promise<string> {
    const fw = (await attrValue<string>("clients.focus.winid")) ?? "";
    let i = 0;
    let out = "";
    for (const wid of await windowOrder()) {
        if (wid === fw) continue;
        const f = await clientRow(wid);
        if (!f || f.min) continue;
        i += 1;
        const disp = `${String(i).padStart(2, " ")}. ${f.ttl || f.cls}`;
        out += row(disp, "info", f.wid);
    }
    ui("windows: %d rows", i);
    return out;
}

export async function hiddenMenu(): Promise<void> {
    const rev = ROFI_RETV();
    if (rev === undefined) {
        // Launcher: the three-state machine, branched on the minimized
        // COUNT (not the rows blob — a row splits on \0 into display +
        // meta parts, so the blob can never be counted).
        const minimized: string[] = [];
        for (const wid of await windowOrder()) {
            // herbstutil TYPES the leaf: a real boolean, never "true"
            if ((await attrValue<boolean>(`clients.${wid}.minimized`)) === true) {
                minimized.push(wid);
            }
        }
        if (minimized.length === 0) {
            // No hidden clients at all.
            const fw = (await attrValue<string>("clients.focus.winid")) ?? "";
            let other = false;
            for (const w of await windowOrder()) {
                const f = await clientRow(w);
                if (f && !f.min && f.wid !== fw) {
                    other = true;
                    break;
                }
            }
            if (!other && fw) {
                ui("hidden: single window is focused -> minimize");
                await hc("set_attr", `clients.${fw}.minimized`, "true");
                return;
            }
            ui("hidden: no hidden clients -> windows fallback (focused excluded)");
            await spawnWindowsFallback();
        }
        // Exactly one hidden window: no menu needed, just reveal it.
        if (minimized.length === 1) {
            ui("hidden: single hidden client %s -> reveal", minimized[0]);
            await revealWid(minimized[0]);
            return;
        }
        // narrower than the shared window-switcher theme default
        launchRofi([
            "-show", "hidden",
            "-modi", modeSpec("hidden", ["hidden"]),
            "-theme", SWITCHER_THEME,
            "-theme-str", "window { width: 35em; }",
            "-auto-select",
            "-kb-custom-1", "MouseSecondary",
        ], ["hidden"]);
    }

    switch (rev) {
        case "0": // initial call: emit the hidden window rows
            process.stdout.write(menuOpt("use-hot-keys", "true"));
            process.stdout.write(menuOpt("prompt", "hidden"));
            process.stdout.write(menuOpt("no-custom", "true"));
            process.stdout.write(await hiddenRows());
            break;
        case "1": // accepted a row: bring (follows the window to its tag)
            await hc("bring", process.env.ROFI_INFO ?? "");
            break;
        case "10": // right-click hot-key: jumpto (unminimize + focus)
            await hc("jumpto", process.env.ROFI_INFO ?? "");
            break;
    }
    // Actions print no rows, so rofi quits
}
