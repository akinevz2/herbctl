// tests/machines.test.ts — port-fidelity suite for the state machines
// (get-zoom / hc_zoom, get-extracted / hc_floatx, get-focus / hc_focus).
// Same mocked-herbstclient harness as chains.test.ts.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { zoomToggle } from "../src/lib/zoom";
import { floatYank } from "../src/lib/extracted";
import { floatFocus, floatUnfocus } from "../src/lib/focus";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

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
    test("(a) tiled -> flag reset + hc_center root + hc_resize frame + hc_fit_to root, under lock", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
            ["^attr clients\\.0x1000001\\.tag$", "0", "work"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "false"],
        ]);
        expect(await zoomToggle()).toBe(true);
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["lock"],
            ["attr", "clients.0x1000001.tag"],
            ["attr", "clients.0x1000001.floating"],
            ["attr", "clients.0x1000001.fullscreen", "off"],
            ["attr", "clients.0x1000001.pseudotile", "off"],
            [`${FIX}/hc_center`, "root"],
            [`${FIX}/hc_resize`, "0x1000001", "frame"],
            [`${FIX}/hc_fit_to`, "root"],
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
            ",", "attr", "tags.focus.tiling.focused_frame.content_geometry", ",", "echo", "|",
            ",", "attr", "clients.focus.floating_effectively",
        ];
    const UNFLOAT_CHAIN = (wid: string) => [
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    ];

    test("focus-a-float-then-unfloat: tiling layer + visible float -> unfloat_wid(first_float)", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|0|2|max|work|800x600+6+35|false"],
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
            ["attr", "tags.focus.floating_focused"], // ff read
            ["list_clients", "--tag=work"], // first_float scan
            ["attr", "clients.0x1000001.floating"],
            ["attr", "clients.0x1000001.minimized"],
            ["attr", "tags.focus.floating_focused", "on"], // the try-focus
            UNFLOAT_CHAIN("0x1000001"),
            ["jumpto", "0x1000001"],
            ["unlock"],
        ]);
    });

    test("yank: no floats to focus + populated frame -> float + hc_center root + register on, frame left alone", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000003"],
            ["^chain , attr tags\\.focus\\.curframe_wcount", "0", "1|1|1|grid|work|800x600+6+35|false"],
            ["^list_clients --tag=work$", "0", "0x1000003"],
            ["^attr clients\\.0x1000003\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""], // re-entry fails: no floats
        ]);
        await floatYank();
        expect(log()).toEqual([
            ["lock"],
            ["attr", "clients.focus.winid"],
            stateChain(),
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000003.floating"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["attr", "clients.focus.floating", "on"], // yank
            [`${FIX}/hc_center`, "root"],
            ["attr", "tags.focus.floating_focused", "on"],
            ["unlock"],
        ]);
    });

    test("float focused, multiple frames (the old defer) -> unified: un-float it + re-focus the tiling layer", async () => {
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000004.floating"],
            ["attr", "clients.0x1000004.minimized"],
            UNFLOAT_CHAIN("0x1000004"),
            ["jumpto", "0x1000004"],
            ["attr", "tags.focus.floating_focused", "off"], // the re-focus attempt
            ["unlock"],
        ]);
    });

    test("float focused, ONE frame (the old use_previous + hc_tile register) -> the same unified un-float", async () => {
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000005.floating"],
            ["attr", "clients.0x1000005.minimized"],
            UNFLOAT_CHAIN("0x1000006"),
            ["jumpto", "0x1000006"],
            ["attr", "tags.focus.floating_focused", "off"], // the re-focus attempt
            ["unlock"],
        ]);
    });

    test("float focused, empty focused frame -> the same unified un-float (no frame reads, no hc_tile)", async () => {
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000007.floating"],
            ["attr", "clients.0x1000007.minimized"],
            UNFLOAT_CHAIN("0x1000007"),
            ["jumpto", "0x1000007"],
            ["attr", "tags.focus.floating_focused", "off"], // the re-focus attempt
            ["unlock"],
        ]);
    });

    test("float focused, populated max frame (the old hc_tile register) -> the same unified un-float", async () => {
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x100000b.floating"],
            ["attr", "clients.0x100000b.minimized"],
            UNFLOAT_CHAIN("0x100000b"),
            ["jumpto", "0x100000b"],
            ["attr", "tags.focus.floating_focused", "off"], // the re-focus attempt
            ["unlock"],
        ]);
    });

    test("tidying remove: empty frame, >1 frame, tag still holds clients -> remove", async () => {
        scenario([
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000008.floating"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["attr", "tags.by-name.work.client_count"], // tag_total
            ["remove"],
            ["unlock"],
        ]);
    });

    test("tidying reveal: nothing tiled, minimized clients exist -> reveal chain over the tag's clients", async () => {
        scenario([
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x1000009.floating"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["list_clients", "--tag=work"], // has_minimized re-enumerates
            ["chain", ",", "attr", "clients.0x1000009.minimized"], // has_minimized
            ["list_clients", "--tag=work"], // the reveal re-enumerates
            ["chain", ",", "attr", "clients.0x1000009.minimized", "off"], // reveal
            ["unlock"],
        ]);
    });

    test("polyframes hidden: max layout + minimized clients + empty frame -> spawn polyframes hidden", async () => {
        scenario([
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x100000c.floating"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
            ["attr", "tags.by-name.work.client_count"], // tag_total == 0 -> no remove
            ["list_clients", "--tag=work"], // has_minimized re-enumerates
            ["chain", ",", "attr", "clients.0x100000c.minimized"], // has_minimized
            ["spawn", `${FIX}/polyframes hidden`],
            ["unlock"],
        ]);
    });

    test("fallback: single empty frame, nothing hidden -> use_previous + bring the original client", async () => {
        scenario([
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
            ["attr", "tags.focus.floating_focused"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x100000a.floating"],
            ["attr", "tags.focus.floating_focused", "on"], // fails
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

    test("(c->e) tiling layer + layer-switch succeeds + EMPTY frame -> un-float the pre-scanned float (no jumpto, no lock)", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000001"],
            ["^attr clients\\.0x2000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x2000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "0"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"], // pre-scan
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000001.floating"],
            ["attr", "clients.0x2000001.minimized"],
            ["attr", "tags.focus.floating_focused"], // ff read
            ["attr", "tags.focus.floating_focused", "on"], // the try-focus
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // fcc == 0
            UNFLOAT_CHAIN("0x2000001"), // no jumpto — already focused
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
            ["attr", "tags.focus.floating_focused", "on"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // fcc > 0 -> stop
        ]);
    });

    test("(g) switch fails + max layout -> flag chain, hc_center frame, vacated frame removed, hc_fit_to frame, algorithm max", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000003"],
            ["^attr clients\\.0x2000003\\.floating$", "0", "false"], // no visible float
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused on$", "1", ""], // re-entry fails
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.algorithm$", "0", "max"],
            ["^attr clients\\.focus\\.winid$", "0", "0x2000003"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "0"],
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
            ["chain", ",", "attr", "clients.0x2000003.fullscreen", "off",
             ",", "attr", "clients.0x2000003.pseudotile", "off"],
            [`${FIX}/hc_center`, "frame"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // vcc == 0
            ["remove"], // Mod-f owns frame closing here
            [`${FIX}/hc_fit_to`, "frame"],
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
        ]);
        await floatFocus();
        const entries = log();
        expect(entries).not.toContainEqual(["remove"]);
        expect(entries.slice(-4)).toEqual([
            [`${FIX}/hc_center`, "frame"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // vcc == 1
            [`${FIX}/hc_fit_to`, "frame"],
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

    test("(h) floating_focused TRUE -> direct un-float (NO hc_tile), client_count read unused", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000005"],
            ["^attr clients\\.0x2000005\\.floating$", "0", "true"],
            ["^attr clients\\.0x2000005\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
            ["^attr clients\\.focus\\.winid$", "0", "0x2000006"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "1"],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000005.floating"],
            ["attr", "clients.0x2000005.minimized"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"], // wid (fallback to float_wid)
            ["attr", "tags.focus.tiling.focused_frame.client_count"], // read, unused
            UNFLOAT_CHAIN("0x2000006"),
        ]);
    });

    test("(h) no focused window and no visible float -> stop after the reads", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x2000007"],
            ["^attr clients\\.0x2000007\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "true"],
            ["^attr clients\\.focus\\.winid$", "1", ""],
        ]);
        await floatFocus();
        expect(log()).toEqual([
            ["attr", "tags.focus.name"],
            ["list_clients", "--tag=work"],
            ["attr", "clients.0x2000007.floating"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"], // empty -> no float_wid -> stop
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

    test("tiling focused + visible float -> recall (switch + jumpto + hc_center root), then the tiling window becomes a top-left quarter companion float", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000001"],
            ["^attr clients\\.0x1000001\\.floating$", "0", "true"],
            ["^attr clients\\.0x1000001\\.minimized$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            // the tiling window that becomes the companion float
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1920x1080+0+0"],
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
            ["attr", "clients.0x1000001.floating"],
            ["attr", "clients.0x1000001.minimized"],
            ["attr", "tags.focus.floating_focused"],
            ["attr", "clients.focus.winid"], // the companion capture
            // companion float FIRST (unconditional): register chain,
            // then the top-left quarter rect (960x540 = half work
            // area; +2+24 = the floating deco margins — the outline
            // sits flush at 0,0)
            ["chain",
                ",", "attr", "clients.0x1000002.fullscreen", "off",
                ",", "attr", "clients.0x1000002.pseudotile", "off",
                ",", "attr", "clients.0x1000002.floating", "on"],
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating.border_width"],
            ["attr", "theme.floating.padding_left"],
            ["attr", "theme.floating.padding_top"],
            ["attr", "theme.floating.title_height"],
            ["attr", "theme.floating.title_depth"],
            [`${FIX}/hc_resize`, "0x1000002", "960x540+2+24"],
            // then the recall (switch + jumpto + hc_center root)
            ["attr", "tags.focus.floating_focused", "on"],
            ["jumpto", "0x1000001"],
            [`${FIX}/hc_center`, "root"],
        ]);
    });

    test("tiling focused + no float -> companion-only: the tiling window floats to the corner and takes the float session", async () => {
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^list_clients --tag=work$", "0", "0x1000003"],
            ["^attr clients\\.0x1000003\\.floating$", "0", "false"],
            ["^attr tags\\.focus\\.floating_focused$", "0", "false"],
            ["^attr clients\\.focus\\.winid$", "0", "0x1000003"],
            ["^attr tags\\.focus\\.floating_focused on$", "0", ""],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1920x1080+0+0"],
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
            ["chain",
                ",", "attr", "clients.0x1000003.fullscreen", "off",
                ",", "attr", "clients.0x1000003.pseudotile", "off",
                ",", "attr", "clients.0x1000003.floating", "on"],
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating.border_width"],
            ["attr", "theme.floating.padding_left"],
            ["attr", "theme.floating.padding_top"],
            ["attr", "theme.floating.title_height"],
            ["attr", "theme.floating.title_depth"],
            [`${FIX}/hc_resize`, "0x1000003", "960x540+2+24"],
            // the companion IS the float session's focus (the yank
            // convention: floating on + floating_focused on) — no
            // jumpto, no hc_center
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
