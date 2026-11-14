// tests/machines.test.ts — port-fidelity suite for the state machines
// (get-zoom / hc_zoom, get-extracted / hc_floatx, get-focus / hc_focus).
// Same mocked-herbstclient harness as chains.test.ts.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { zoomToggle } from "../src/lib/zoom";
import { floatYank } from "../src/lib/extracted";
import { floatFocus } from "../src/lib/float-focus";
import { floatUnfocus } from "../src/lib/float-unfocus";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

// ── attrTree fixtures (herbstutil parseAttr wire format) ─────────────
// The migrated geometry machines read subtrees (theme.floating.,
// clients.<wid>., …) — one `attr <path>.` round trip parsed by
// herbstutil. Deco outline: border 2 + paddings 0 + title 20 + depth
// 2 → L=R=B=2, T=24 (the +2+24 corner insets of the companion tests).
// The scenario file is LINE-based, so the multi-line dumps travel as
// literal \n escapes — the mock's `printf %b` expands them.
const THEME_TREE = [
    "7 attributes:",
    " i u w border_width = 2",
    " i u w padding_left = 0",
    " i u w padding_right = 0",
    " i u w padding_bottom = 0",
    " i u w padding_top = 0",
    " i u w title_height = 20",
    " i u w title_depth = 2",
].join("\\n");
/** A floating client subtree (floating on, geometry authoritative). */
const CLIENT_TREE_FLOATING = (geo: string) => [
    "2 attributes:",
    " b u w floating = true",
    ` R u w floating_geometry = ${geo}`,
].join("\\n");
/** Parent-frame subtree with an EMPTY index (single unsplit root). */
const PARENT_TREE_EMPTY = [
    "1 attributes:",
    ' s u w index = ""',
].join("\\n");
/** Root-frame subtree (content_geometry only). */
const ROOT_TREE = (geo: string) => [
    "1 attributes:",
    ` R u w content_geometry = ${geo}`,
].join("\\n");

let tmp = "";
let logPath = "";
let scenarioPath = "";
let savedPath = "";
let savedHelperDir: string | undefined;

function log(): string[][] {
    return readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const parts = line.split("\x1f");
            return parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
        });
}

function scenario(rows: Array<[string, string, string]>): void {
    writeFileSync(scenarioPath, rows.map((r) => r.join("\t")).join("\n") + "\n");
}

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "herbctl-machines-"));
    logPath = join(tmp, "mock.log");
    scenarioPath = join(tmp, "mock.scenario");
    writeFileSync(logPath, "");
    for (const f of ["herbstclient", "hc_center", "hc_resize", "hc_fit_to", "hc_maximize", "hc_unmaximize", "hc_tile"]) {
        chmodSync(join(FIX, f), 0o755);
    }
    savedPath = process.env.PATH ?? "";
    savedHelperDir = process.env.HERBSTCTL_HELPER_DIR;
    process.env.PATH = `${FIX}:${savedPath}`;
    process.env.HERBSTCTL_HELPER_DIR = FIX;
    process.env.HERBSTCTL_MOCK_LOG = logPath;
    process.env.HERBSTCTL_MOCK_SCENARIO = scenarioPath;
});

afterEach(() => {
    process.env.PATH = savedPath;
    if (savedHelperDir === undefined) delete process.env.HERBSTCTL_HELPER_DIR;
    else process.env.HERBSTCTL_HELPER_DIR = savedHelperDir;
    delete process.env.HERBSTCTL_MOCK_LOG;
    delete process.env.HERBSTCTL_MOCK_SCENARIO;
    rmSync(tmp, { recursive: true, force: true });
});

// zoomToggle — the hc_zoom press-state machine.
describe("zoomToggle (hc_zoom port)", () => {
    test("(a) tiled -> the corner machine (flash-free: geometry pre-set, then float-on), registered, under zoom's outer lock", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
            ["^attr clients\\.0x1000001\\.tag$", "0", "work"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "false"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1000x800+0+0"],
        ]);
        expect(await zoomToggle()).toBe(true);
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["lock"],
            ["attr", "clients.0x1000001.tag"],
            ["attr", "clients.0x1000001.floating"],
            ["set_attr", "clients.0x1000001.fullscreen", "off"],
            ["set_attr", "clients.0x1000001.pseudotile", "off"],
            // the corner machine (no current-size read: the window
            // BECOMES the quadrant): inner 996x774 -> 498x387 at the
            // top-left inner corner (+2+24)
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating."],
            // PRE-SET the corner geometry BEFORE the float-on (the
            // flash fix: the first floating paint already sits in the
            // quadrant)
            ["set_attr", "clients.0x1000001.floating_geometry", "498x387+2+24"],
            ["set_attr", "clients.0x1000001.floating", "on"],
            // the re-assert rides out hlwm's async apply
            ["set_attr", "clients.0x1000001.floating_geometry", "498x387+2+24"],
            // the float-session register
            ["chain", ".", "try", "set_attr", "tags.focus.floating_focused", "on", ".",
             "jumpto", "0x1000001", ".", "bring", "0x1000001"],
            ["unlock"],
        ]);
    });

    test("(b) floating -> hc_maximize (the <tag>-max tag dance, PF_MAX state owned by the helper)", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
            ["^attr clients\\.0x1000001\\.tag$", "0", "work"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "true"],
        ]);
        expect(await zoomToggle()).toBe(true);
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["lock"],
            ["attr", "clients.0x1000001.tag"],
            ["attr", "clients.0x1000001.floating"],
            [`${FIX}/hc_maximize`, "0x1000001"],
            ["unlock"],
        ]);
    });

    test("(c) on a <tag>-max tag -> hc_unmaximize (the -max check runs BEFORE the floating check)", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
            ["^attr clients\\.0x1000001\\.tag$", "0", "work-max"],
        ]);
        expect(await zoomToggle()).toBe(true);
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["lock"],
            ["attr", "clients.0x1000001.tag"],
            // floating is read BEFORE the case (the -max check only
            // branches on the tag).
            ["attr", "clients.0x1000001.floating"],
            [`${FIX}/hc_unmaximize`, "0x1000001"],
            ["unlock"],
        ]);
    });

    test("no focused window -> false, no lock taken (hc_zoom exits 1)", async () => {
        scenario([["^attr clients\\.focus\\.winid$", "1", ""]]);
        expect(await zoomToggle()).toBe(false);
        expect(log()).toEqual([["attr", "clients.focus.winid"]]);
    });
});

// floatYank — the hc_floatx layer-yank state machine.
describe("floatYank (hc_floatx port)", () => {
    // The batched state read every branch starts with (chain + echo "|").
    const stateChain = () =>
        [
            "chain",
            ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
            ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
            ",", "attr", "tags.focus.name", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.content_geometry",
        ];
    const UNFLOAT_CHAIN = (wid: string) => [
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    ];

    test("grab: tiling layer + visible float + STABLE-EMPTY focused frame -> un-float the float into it", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|0|2|max|work|800x600+6+35|false"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "0"],
            ["^list_clients --tag=work$", "0", "0x1000001\n0x1000002"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"], // orig
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"], // ff read
            ["list_clients", "--tag=work"], // first_float scan
            ["attr", "clients.0x1000001.floating"],
            ["attr", "clients.0x1000001.minimized"],
            ["attr", "clients.focus.floating"], // the focused-float probe (close-out edge)
            ["attr", "tags.focus.floating_focused", "on"], // the try-focus
            // the grab: stable-empty frame check (settle re-read)
            ["attr", "tags.focus.tiling.focused_frame.client_count"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"],
            UNFLOAT_CHAIN("0x1000001"),
            ["jumpto", "0x1000001"],
            ["unlock"],
        ]);
    });

    test("focus-a-float: tiling layer + visible float + POPULATED focused frame -> jumpto focus, the float stays floating", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x100000d"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|1|2|max|work|800x600+6+35|false"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "1"],
            ["^list_clients --tag=work$", "0", "0x1000001\n0x100000d"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"], // orig
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"], // ff read
            ["list_clients", "--tag=work"], // first_float scan
            ["attr", "clients.0x1000001.floating"],
            ["attr", "clients.0x1000001.minimized"],
            ["attr", "clients.focus.floating"], // the focused-float probe (close-out edge)
            ["attr", "tags.focus.floating_focused", "on"], // the try-focus
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // populated: 1
            // no grab — the frame is populated: focus the float only
            ["jumpto", "0x1000001"],
            ["unlock"],
        ]);
    });

    test("yank: no floats to focus + populated frame -> float + place centered in root + register, under ONE lock, frame left alone", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000003"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|1|1|grid|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000003"],
            ["^attr clients\\.0x1000003\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""], // re-entry fails: no floats
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1000x800+0+0"],
            ["^attr clients\\.0x1000003\\.floating_geometry$", "0", "500x400+250+211"],
            ["^attr clients\\.0x1000003\\.content_geometry$", "0", "500x400+250+211"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000003.floating"],
            ["attr", "clients.focus.floating"], // the focused-float probe (post-hand-back edge guard)
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["lock"], // the yank's own lock (nested, refcount-balanced)
            ["set_attr", "clients.0x1000003.floating", "on"], // yank
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating."],
            ["attr", "clients.0x1000003.floating_geometry"],
            ["set_attr", "clients.0x1000003.floating_geometry", "500x400+250+211"],
            ["attr", "clients.0x1000003.content_geometry"],
            ["chain", ".", "try", "set_attr", "tags.focus.floating_focused", "on", ".",
             "jumpto", "0x1000003", ".", "bring", "0x1000003"],
            ["attr", "tags.focus.floating_focused", "on"], // the machine's own register write
            ["unlock"],
            ["unlock"],
        ]);
    });

    test("float focused, populated frame (multi-frame) -> CLOSE OUT: un-float into the frame below", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000004"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|1|2|max|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000004"],
            ["^attr clients\\.0x1000004\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000004\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000004.floating"],
            ["attr", "clients.0x1000004.minimized"],
            UNFLOAT_CHAIN("0x1000004"),
            ["jumpto", "0x1000004"],
            ["attr", "tags.focus.floating_focused", "off"], // the follow-up write
            ["unlock"],
        ]);
    });

    test("float focused, one frame -> the same close-out", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000006"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "2|1|1|max|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000005"],
            ["^attr clients\\.0x1000005\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000005\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000005.floating"],
            ["attr", "clients.0x1000005.minimized"],
            UNFLOAT_CHAIN("0x1000006"),
            ["jumpto", "0x1000006"],
            ["attr", "tags.focus.floating_focused", "off"], // the follow-up write
            ["unlock"],
        ]);
    });

    test("float focused, EMPTY focused frame -> the same close-out (no frame reads)", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000007"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "0|0|3|grid|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000007"],
            ["^attr clients\\.0x1000007\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000007\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000007.floating"],
            ["attr", "clients.0x1000007.minimized"],
            UNFLOAT_CHAIN("0x1000007"),
            ["jumpto", "0x1000007"],
            ["attr", "tags.focus.floating_focused", "off"], // the follow-up write
            ["unlock"],
        ]);
    });

    test("float focused, EMPTY max frame -> the same close-out", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x100000b"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "0|0|3|max|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x100000b"],
            ["^attr clients\\.0x100000b\\.floating$", "0", "true"],
            ["^attr clients\\.0x100000b\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x100000b.floating"],
            ["attr", "clients.0x100000b.minimized"],
            UNFLOAT_CHAIN("0x100000b"),
            ["jumpto", "0x100000b"],
            ["attr", "tags.focus.floating_focused", "off"], // the follow-up write
            ["unlock"],
        ]);
    });

    test("tidying remove: empty frame, >1 frame, tag still holds clients -> remove", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000008"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "0|0|2|grid|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000008"],
            ["^attr clients\\.0x1000008\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""],
            ["^attr tags\\.by-name\\.work\\.client_count$", "0", "3"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000008.floating"],
            ["attr", "clients.focus.floating"], // the focused-float probe (post-hand-back edge guard)
            ["attr", "tags.focus.floating_focused", "on"], // fails
            // tidyNoFloats: re-reads the tag name + the tidying state
            ["attr", "tags.focus.name"],
            ["chain", ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
             ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
             ",", "attr", "tags.focus.name"],
            ["attr", "tags.by-name.work.client_count"], // tag_total -> remove
            ["remove"],
            ["unlock"],
        ]);
    });

    test("tidying reveal: nothing tiled, minimized clients exist -> reveal chain over the tag's clients", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000009"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|0|2|grid|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000009"],
            ["^attr clients\\.0x1000009\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""],
            ["^chain , attr clients\\.0x1000009\\.minimized$", "0", "true"], // has_minimized
            ["^chain , attr clients\\.0x1000009\\.minimized off$", "0", ""], // the reveal
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000009.floating"],
            ["attr", "clients.focus.floating"], // the focused-float probe (post-hand-back edge guard)
            ["attr", "tags.focus.floating_focused", "on"], // fails
            // tidyNoFloats: re-reads the tag name + the tidying state
            ["attr", "tags.focus.name"],
            ["chain", ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
             ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
             ",", "attr", "tags.focus.name"],
            ["list_clients", "--tag=work"], // has_minimized re-enumerates
            ["chain", ",", "attr", "clients.0x1000009.minimized"], // has_minimized
            ["list_clients", "--tag=work"], // the reveal re-enumerates
            ["chain", ",", "attr", "clients.0x1000009.minimized", "off"], // reveal
            ["unlock"],
        ]);
    });

    test("polyframes hidden: max layout + minimized clients + empty frame -> spawn polyframes hidden", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^attr clients\\.focus\\.winid$", "0", "0x100000c"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "0|0|1|max|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x100000c"],
            ["^attr clients\\.0x100000c\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""],
            ["^attr tags\\.by-name\\.work\\.client_count$", "0", "0"],
            ["^chain , attr clients\\.0x100000c\\.minimized$", "0", "true"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x100000c.floating"],
            ["attr", "clients.focus.floating"], // the focused-float probe (post-hand-back edge guard)
            ["attr", "tags.focus.floating_focused", "on"], // fails
            // tidyNoFloats: re-reads the tag name + the tidying state
            ["attr", "tags.focus.name"],
            ["chain", ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
             ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
             ",", "attr", "tags.focus.name"],
            ["attr", "tags.by-name.work.client_count"], // tag_total == 0 -> no remove
            ["list_clients", "--tag=work"], // has_minimized re-enumerates
            ["chain", ",", "attr", "clients.0x100000c.minimized"], // has_minimized
            ["spawn", `${FIX}/polyframes hidden`],
            ["unlock"],
        ]);
    });

    test("fallback: single empty frame, nothing hidden -> use_previous + bring the original client", async () => {
        scenario([
            ["^attr tags\.focus\.name$", "0", "work"],
            ["^attr clients\\.focus\\.winid$", "0", "0x100000a"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "0|0|1|grid|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x100000a"],
            ["^attr clients\\.0x100000a\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""],
            ["^attr tags\\.by-name\\.work\\.client_count$", "0", "0"],
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.name"], // the explicit tag read (the state chain no longer carries it)
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x100000a.floating"],
            ["attr", "clients.focus.floating"], // the focused-float probe (post-hand-back edge guard)
            ["attr", "tags.focus.floating_focused", "on"], // fails
            // tidyNoFloats: re-reads the tag name + the tidying state
            ["attr", "tags.focus.name"],
            ["chain", ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
             ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
             ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
             ",", "attr", "tags.focus.name"],
            ["attr", "tags.by-name.work.client_count"], // tag_total == 0 -> no remove
            ["use_previous"],
            ["bring", "0x100000a"],
            ["unlock"],
        ]);
    });
});

// floatFocus — the hc_focus float-register machine ($Mod-f). NO lock is
// ever taken (hc_focus's header: the helpers own their locks).
describe("floatFocus (hc_focus port)", () => {
    const UNFLOAT_CHAIN = (wid: string) => [
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    ];

    test("(c) tiling layer + layer-switch succeeds -> TERMINATE: the float layer is focused, the float stays floating (no grab — Mod-f never un-floats)", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000001"],
            ["^attr clients\\.0x2000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x2000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"], // pre-scan
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000001.floating"],
            ["attr", "clients.0x2000001.minimized"],
            ["attr", "tags.focus.floating_focused"], // ff read
            ["attr", "tags.focus.floating_focused", "on"], // the try-focus
            // terminate — the empty-frame grab is Mod-x's register now
        ]);
    });

    test("(f) layer-switch succeeds + populated frame -> terminate, the float stays", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000001"],
            ["^attr clients\\.0x2000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x2000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "2"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000001.floating"],
            ["attr", "clients.0x2000001.minimized"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "tags.focus.floating_focused", "on"], // the try-focus — terminate
        ]);
    });

    test("(g) switch fails + max layout -> float on, place centered in frame, foreground, vacated frame removed, fit guard, algorithm max — ONE lock", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000003"],
            ["^attr clients\\.0x2000003\\.floating$", "0", "false"], // no visible float
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""], // re-entry fails
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.algorithm$", "0", "max"],
            ["^attr clients\\.focus\\.winid$", "0", "0x2000003"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "0"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.content_geometry$", "0", "1000x800+0+0"],
            ["^attr clients\\.0x2000003\\.floating_geometry$", "0", "500x400+250+211"],
            ["^attr clients\\.0x2000003\\.content_geometry$", "0", "500x400+250+211"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000003.floating"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["attr", "tags.focus.tiling.focused_frame.algorithm"], // algo == max
            ["attr", "clients.focus.winid"],
            ["lock"], // ONE lock around the whole lift
            ["chain", ",", "attr", "clients.0x2000003.fullscreen", "off",
             ",", "attr", "clients.0x2000003.pseudotile", "off"],
            ["set_attr", "clients.0x2000003.floating", "on"],
            // placeCenteredIn (focused frame): geometry, deco margins,
            // adopted size, the placement write, the stable reconcile
            ["attr", "tags.focus.tiling.focused_frame.content_geometry"],
            ["attr", "theme.floating."],
            ["attr", "clients.0x2000003.floating_geometry"],
            ["set_attr", "clients.0x2000003.floating_geometry", "500x400+250+211"],
            ["attr", "clients.0x2000003.content_geometry"],
            // the float-session foreground (the historical hc_center tail)
            ["chain", ".", "try", "set_attr", "tags.focus.floating_focused", "on", ".",
             "jumpto", "0x2000003", ".", "bring", "0x2000003"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // vcc == 0
            ["remove"], // Mod-f owns frame closing here
            // fitTo frame: geometry, margins, size — already fitting,
            // idempotent, no write
            ["attr", "tags.focus.tiling.focused_frame.content_geometry"],
            ["attr", "theme.floating."],
            ["attr", "clients.0x2000003.floating_geometry"],
            ["unlock"],
            ["attr", "tags.focus.tiling.focused_frame.algorithm", "max"], // the tail
        ]);
    });

    test("(g) vacated frame still holds clients -> no remove", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000003"],
            ["^attr clients\\.0x2000003\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.algorithm$", "0", "max"],
            ["^attr clients\\.focus\\.winid$", "0", "0x2000003"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "1"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.content_geometry$", "0", "1000x800+0+0"],
            ["^attr clients\\.0x2000003\\.floating_geometry$", "0", "500x400+250+211"],
            ["^attr clients\\.0x2000003\\.content_geometry$", "0", "500x400+250+211"],
        ]);
        await floatFocus();
        const entries = log();
        expect(entries).not.toContainEqual(["remove"]);
        expect(entries.slice(-6)).toEqual([
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // vcc == 1
            ["attr", "tags.focus.tiling.focused_frame.content_geometry"], // fitTo
            ["attr", "theme.floating."],
            ["attr", "clients.0x2000003.floating_geometry"],
            ["unlock"],
            ["attr", "tags.focus.tiling.focused_frame.algorithm", "max"], // the tail
        ]);
    });

    test("(g) non-max layout -> no lift, just the algorithm=max tail", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000004"],
            ["^attr clients\\.0x2000004\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.algorithm$", "0", "grid"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000004.floating"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["attr", "tags.focus.tiling.focused_frame.algorithm"], // grid != max
            ["attr", "tags.focus.tiling.focused_frame.algorithm", "max"], // tail only
        ]);
    });

    test("(h) floating_focused TRUE -> UNFOCUS the layer, the float preserved (closing out is Mod-x's register)", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000005"],
            ["^attr clients\\.0x2000005\\.floating$", "0", "true"],
            ["^attr clients\\.0x2000005\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000005.floating"],
            ["attr", "clients.0x2000005.minimized"],
            ["attr", "tags.focus.floating_focused"],
            // UNFOCUS the layer: the float is preserved — no reads of
            // the focused window, no un-float
            ["attr", "tags.focus.floating_focused", "off"],
        ]);
    });

    test("(h) no focused window and no visible float -> unfocus the layer after the pre-scan", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000007"],
            ["^attr clients\\.0x2000007\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000007.floating"],
            ["attr", "tags.focus.floating_focused"],
            // UNFOCUS the layer: no wid needed — the layer write only
            ["attr", "tags.focus.floating_focused", "off"],
        ]);
    });
});

// floatUnfocus — the $Mod-x command (hc_floatx moved to $ModCtrl-x).
describe("floatUnfocus ($Mod-x port)", () => {
    const UNFLOAT_CHAIN = (wid: string) => [
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    ];

    test("float focused + EMPTY focused frame -> un-float the focused float into it", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000002"],
            ["^attr clients\\.0x1000002\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000002\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^attr tags\\.focus\\.curframe_wcount$", "0", "0"],
        ]);
        await floatUnfocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000002.floating"],
            ["attr", "clients.0x1000002.minimized"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"],
            ["attr", "tags.focus.curframe_wcount"],
            UNFLOAT_CHAIN("0x1000002"),
        ]);
    });

    test("float focused + populated frame -> focus the tiling layer (float untouched)", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000002"],
            ["^attr clients\\.0x1000002\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000002\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^attr tags\\.focus\\.curframe_wcount$", "0", "1"],
        ]);
        await floatUnfocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000002.floating"],
            ["attr", "clients.0x1000002.minimized"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"],
            ["attr", "tags.focus.curframe_wcount"],
            ["attr", "tags.focus.floating_focused", "off"],
        ]);
    });

    test("tiling focused + visible float -> single-write companion (pre-set corner rect from the tiled content geometry, then float-on), then recall (switch + jumpto + place centered)", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000001"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1920x1080+0+0"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            // the tiled window's content geometry (live while tiled):
            // 1500x900 -> capped at the quarter screen (960x540)
            ["^attr clients\\.0x1000002\\.content_geometry$", "0", "1500x900+0+0"],
            ["^attr theme\\.floating\\.border_width$", "0", "2"],
            ["^attr theme\\.floating\\.padding_left$", "0", "0"],
            ["^attr theme\\.floating\\.padding_top$", "0", "0"],
            ["^attr theme\\.floating\\.title_height$", "0", "20"],
            ["^attr theme\\.floating\\.title_depth$", "0", "2"],
            // the recalled float's geometry reads (placeCenteredIn root)
            ["^attr clients\\.0x1000001\\.floating_geometry$", "0", "900x600+0+0"],
            ["^attr clients\\.0x1000001\\.content_geometry$", "0", "900x600+510+251"],
        ]);
        await floatUnfocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000001.floating"],
            ["attr", "clients.0x1000001.minimized"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"], // the companion capture
            ["attr", "tags.focus.tiling.root.content_geometry"], // the cap source
            ["attr", "clients.0x1000002.content_geometry"], // the adopted (tiled) size
            ["attr", "theme.floating.border_width"],
            ["attr", "theme.floating.padding_left"],
            ["attr", "theme.floating.padding_top"],
            ["attr", "theme.floating.title_height"],
            ["attr", "theme.floating.title_depth"],
            // SINGLE-WRITE companion: the final corner rect (960x540 =
            // quarter screen; +2+24 = the floating deco margins) is
            // PRE-SET while the window is still tiled, THEN the float
            // chain — the first floating paint already sits in the
            // corner (no fill-then-cap double resize)
            ["set_attr", "clients.0x1000002.floating_geometry", "960x540+2+24"],
            ["chain",
                ",", "attr", "clients.0x1000002.fullscreen", "off",
                ",", "attr", "clients.0x1000002.pseudotile", "off",
                ",", "attr", "clients.0x1000002.floating", "on"],
            // then the recall (switch + jumpto + place centered in root)
            ["attr", "tags.focus.floating_focused", "on"],
            ["jumpto", "0x1000001"],
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating."],
            ["attr", "clients.0x1000001.floating_geometry"],
            ["set_attr", "clients.0x1000001.floating_geometry", "900x600+510+251"],
            ["attr", "clients.0x1000001.content_geometry"],
        ]);
    });

    test("tiling focused + no float -> companion-only: single write, the tiling window floats to the corner and takes the float session", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000003"],
            ["^attr clients\\.0x1000003\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000003"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1920x1080+0+0"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            // the tiled content geometry: 1600x1000 -> capped down to
            // the quarter screen (shrink-only)
            ["^attr clients\\.0x1000003\\.content_geometry$", "0", "1600x1000+0+0"],
            ["^attr theme\\.floating\\.border_width$", "0", "2"],
            ["^attr theme\\.floating\\.padding_left$", "0", "0"],
            ["^attr theme\\.floating\\.padding_top$", "0", "0"],
            ["^attr theme\\.floating\\.title_height$", "0", "20"],
            ["^attr theme\\.floating\\.title_depth$", "0", "2"],
        ]);
        await floatUnfocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000003.floating"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"], // the companion capture
            ["attr", "tags.focus.tiling.root.content_geometry"], // the cap source
            ["attr", "clients.0x1000003.content_geometry"], // the adopted (tiled) size
            ["attr", "theme.floating.border_width"],
            ["attr", "theme.floating.padding_left"],
            ["attr", "theme.floating.padding_top"],
            ["attr", "theme.floating.title_height"],
            ["attr", "theme.floating.title_depth"],
            ["set_attr", "clients.0x1000003.floating_geometry", "960x540+2+24"], // 1600x1000 capped down
            ["chain",
                ",", "attr", "clients.0x1000003.fullscreen", "off",
                ",", "attr", "clients.0x1000003.pseudotile", "off",
                ",", "attr", "clients.0x1000003.floating", "on"],
            // the companion IS the float session's focus (the yank
            // convention: floating on + floating_focused on) — no
            // jumpto, no centering
            ["attr", "tags.focus.floating_focused", "on"],
        ]);
    });

    test("companion smaller than a quarter screen -> keeps its adopted size (single write, corner move only — shrink-only, never grow)", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000009"],
            ["^attr clients\\.0x1000009\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000009"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1920x1080+0+0"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            // 800x400 is under the quarter screen in both dimensions —
            // kept (shrink-only)
            ["^attr clients\\.0x1000009\\.content_geometry$", "0", "800x400+0+0"],
            ["^attr theme\\.floating\\.border_width$", "0", "2"],
            ["^attr theme\\.floating\\.padding_left$", "0", "0"],
            ["^attr theme\\.floating\\.padding_top$", "0", "0"],
            ["^attr theme\\.floating\\.title_height$", "0", "20"],
            ["^attr theme\\.floating\\.title_depth$", "0", "2"],
        ]);
        await floatUnfocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000009.floating"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"],
            ["attr", "tags.focus.tiling.root.content_geometry"], // the cap source
            ["attr", "clients.0x1000009.content_geometry"], // the adopted (tiled) size
            ["attr", "theme.floating.border_width"],
            ["attr", "theme.floating.padding_left"],
            ["attr", "theme.floating.padding_top"],
            ["attr", "theme.floating.title_height"],
            ["attr", "theme.floating.title_depth"],
            // the adopted size kept, corner anchor only
            ["set_attr", "clients.0x1000009.floating_geometry", "800x400+2+24"],
            ["chain",
                ",", "attr", "clients.0x1000009.fullscreen", "off",
                ",", "attr", "clients.0x1000009.pseudotile", "off",
                ",", "attr", "clients.0x1000009.floating", "on"],
            ["attr", "tags.focus.floating_focused", "on"],
        ]);
    });

});

// The CLI verbs of the machines: registered under their functional
// names (the get-* set, no mod-* aliases in herbctl).
describe("machine CLI verbs", () => {
    test("get-zoom / get-extracted / get-focus are registered", async () => {
        const zoom = (await import("../src/commands/zoom")).default;
        const extracted = (await import("../src/commands/float-yank")).default;
        const focus = (await import("../src/commands/float-focus")).default;
        expect((zoom as { name: string }).name).toBe("zoom");
        expect((extracted as { name: string }).name).toBe("float-yank");
        expect((focus as { name: string }).name).toBe("float-focus");
    });
});
