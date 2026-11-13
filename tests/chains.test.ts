// tests/chains.test.ts — port-fidelity suite for the pure keybind
// chains (src/lib/chains.ts) and the small imperatives
// (src/lib/imperatives.ts).
//
// The herbstclient binary is mocked via PATH (tests/fixtures/mock-bin):
// the fixture records every invocation's argv to a log file and replies
// from a scenario table ("regex<TAB>exit<TAB>output"). The dots helper
// binaries (hc_center, hc_resize, hc_fit_to, hc_tile, hc_maximize,
// hc_unmaximize) are mocked the same way, located through the
// HERBSTCTL_HELPER_DIR override. Every test asserts the recorded
// argv sequence matches the hlwm chain from the source binding —
// nothing here ever talks to a live herbstluftwm session.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    focusFrameLeft,
    focusFrameDown,
    splitBottomFocus,
    splitDown,
    getDeck,
    getDedeck,
    shiftLeft,
    explodeFrame,
    getForward,
    closeOrRemove,
    fullscreenToggle,
    minimizeToggle,
    closeWindow,
    rotateTree,
    shiftUp,
    shiftDown,
    getSouth,
    shiftRight,
    newFrame,
    splitRightCycle,
    splitRightFocus,
    xkillOrClose,
} from "../src/lib/chains";
import {
    minimizeKeepFrame,
    removeEmptyFrame,
    unfloatWid,
} from "../src/lib/imperatives";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

let tmp = "";
let logPath = "";
let scenarioPath = "";
let savedPath = "";
let savedHelperDir: string | undefined;

/** Parse the mock log: one entry per invocation, argv split on \x1f. */
function log(): string[][] {
    return readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const parts = line.split("\x1f");
            return parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
        });
}

/** Write the scenario table: [regex, exitCode, output] rows. */
function scenario(rows: Array<[string, string, string]>): void {
    writeFileSync(scenarioPath, rows.map((r) => r.join("\t")).join("\n") + "\n");
}

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "herbctl-chains-"));
    logPath = join(tmp, "mock.log");
    scenarioPath = join(tmp, "mock.scenario");
    writeFileSync(logPath, "");
    // Defensive chmod: git preserves the exec bit, but fat/WSL
    // metadata can drop it — the fixtures must stay spawnable.
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

// The pure keybind chains: ONE chained herbstclient spawn, argv
// verbatim from the keys.d fragments.
describe("pure keybind chains", () => {
    // focus.sh $Mod-s
    test("getSouth issues the zoom/peek grid chain", async () => {
        await getSouth();
        expect(log()).toEqual([
            [
                "chain", ":", "lock",
                ":", "or",
                ",", "and", ".", "compare", "tags.focus.urgent_count", "gt", "0", ".", "jumpto", "urgent",
                ",", "focus", "--level=frame", "down",
                ",", "and",
                ".", "attr", "tags.focus.floating_focused", "true",
                ".", "attr", "tags.focus.focused_client.floating", "off",
                ".", "attr", "tags.focus.focused_client.pseudotile", "off",
                ",", "and",
                "!", "compare", "tags.focus.curframe_wcount", "gt", "1",
                "!", "cycle", "-1",
                "!", "attr", "clients.focus.pseudotile", "off",
                ",", "pseudotile", "toggle",
                ":", "unlock",
            ],
        ]);
    });

    // nav.sh $Mod-w
    test("getForward issues the leave-floating/ cycle-up chain", async () => {
        await getForward();
        expect(log()).toEqual([
            [
                "chain", ":", "lock", ":", "or",
                ",", "and",
                "!", "compare", "tags.focus.floating_focused", "=", "1",
                "!", "attr", "tags.focus.floating_focused", "off",
                ",", "and",
                "!", "compare", "tags.focus.curframe_wcount", "gt", "1",
                "!", "cycle", "+1",
                ",", "focus", "--level=frame", "up",
                ",", "cycle_frame",
                ":", "unlock",
            ],
        ]);
    });

    // nav.sh $Mod-d
    test("getDeck issues the count-gated layout cycler", async () => {
        await getDeck();
        expect(log()).toEqual([
            [
                "or",
                ",", "and",
                ".", "compare", "tags.focus.curframe_wcount", "gt", "3",
                ".", "cycle_layout", "+1", "max", "vertical", "grid", "horizontal",
                ",", "and",
                ".", "compare", "tags.focus.curframe_wcount", "=", "2",
                ".", "cycle_layout", "+1", "vertical", "max", "horizontal",
                ",", "cycle_layout", "-1", "vertical", "horizontal", "max",
            ],
        ]);
    });

    // nav.sh $ModShift-d
    test("getDedeck issues the count-gated mix-or-remove chain", async () => {
        await getDedeck();
        expect(log()).toEqual([
            [
                "or",
                ".", "and",
                ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
                ",", "cycle_layout", "+1", "max", "grid", "vertical",
                ".", "remove",
            ],
        ]);
    });

    // focus.sh $Mod-e
    test("explodeFrame issues the cycle-backward/explode chain", async () => {
        await explodeFrame();
        expect(log()).toEqual([
            [
                "or", ".",
                "and", ",", "compare", "tags.focus.frame_count", "gt", "1", ",", "cycle_frame", "-1",
                ".", "chain", "!", "split", "explode", "!", "cycle_frame",
            ],
        ]);
    });

    // autostart $Mod-a
    test("focusFrameLeft issues the focus-left-or-split chain", async () => {
        await focusFrameLeft();
        expect(log()).toEqual([
            ["or", ",", "focus", "left", "--level=frame", ",", "split", "left", "0.33333"],
        ]);
    });

    // nav.sh $ModShift-w
    test("shiftUp issues the shift-up ladder (shift up / cycle -1 / cycle+rotate frames)", async () => {
        await shiftUp();
        expect(log()).toEqual([
            [
                "or",
                ",", "shift", "--level=all", "up",
                ",", "or",
                "!", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
                "!", "cycle", "-1",
                ",", "chain", "!", "lock", "!", "rotate", "!", "unlock",
            ],
        ]);
    });

    // focus.sh $ModCtrl-r
    test("rotateTree issues the rotate-or-cycle chain", async () => {
        await rotateTree();
        expect(log()).toEqual([
            [
                "or",
                ",", "and", ".", "compare", "tags.focus.frame_count", "lt", "3",
                ".", "chain", "!", "lock", "!", "rotate", "!", "unlock",
                ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
                ",", "cycle", "+1",
            ],
        ]);
    });

    // autostart $ModCtrl-r with --focus: the focus/skip branch, forced
    test("rotateTree focus mode forces the forward cycle fallback", async () => {
        await rotateTree("focus");
        expect(log()).toEqual([
            [
                "or",
                ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame",
                ",", "cycle", "+1",
            ],
        ]);
    });

    // autostart $ModCtrl-c with --smart: the reversed condition — rotate
    // N-or-more frames, cycle BACKWARDS below (frames when >1, windows
    // on a single frame)
    test("rotateTree smart mode issues the reversed rotate-or-cycle chain", async () => {
        await rotateTree("smart");
        expect(log()).toEqual([
            [
                "or",
                ",", "and", ".", "compare", "tags.focus.frame_count", "ge", "3",
                ".", "chain", "!", "lock", "!", "rotate", "!", "unlock",
                ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame", "-1",
                ",", "cycle", "-1",
            ],
        ]);
    });

    test("rotateTree smart mode honours the threshold", async () => {
        await rotateTree("smart", 4);
        expect(log()).toEqual([
            [
                "or",
                ",", "and", ".", "compare", "tags.focus.frame_count", "ge", "4",
                ".", "chain", "!", "lock", "!", "rotate", "!", "unlock",
                ",", "and", ".", "compare", "tags.focus.frame_count", "gt", "1", ".", "cycle_frame", "-1",
                ",", "cycle", "-1",
            ],
        ]);
    });

    // nav.sh $ModShift-s
    test("shiftDown issues the empty-frame-remove / shift-down-or-split chain", async () => {
        await shiftDown();
        expect(log()).toEqual([
            [
                "or",
                ",", "and", ".", "compare", "tags.focus.curframe_wcount", "=", "0",
                ".", "remove",
                ",", "and", ".", "compare", "tags.focus.curframe_wcount", "gt", "1",
                ".", "or",
                ",", "shift", "down",
                ",", "chain", "!", "split", "bottom", "!", "shift", "down",
            ],
        ]);
    });

    // autostart $ModShift-b
    test("splitDown issues the split-bottom-and-shift chain", async () => {
        await splitDown();
        expect(log()).toEqual([
            [
                "or", ".",
                "and", ",", "compare", "tags.focus.curframe_wcount", "gt", "1",
                ",", "chain", "!", "split", "bottom", "!", "shift", "down",
            ],
        ]);
    });

    // autostart $ModCtrl-a
    test("shiftLeft issues the shift-left / focus-left / split+shift chain", async () => {
        await shiftLeft();
        expect(log()).toEqual([
            [
                "or",
                ",", "shift", "left",
                ",", "focus", "left", "--level=frame",
                ",", "chain", ".", "split", "left", ".", "shift", "left",
            ],
        ]);
    });

    // autostart $ModCtrl-e
    test("shiftRight issues the shift-right / split-right+focus-right chain", async () => {
        await shiftRight();
        expect(log()).toEqual([
            [
                "or",
                ",", "shift", "right",
                ",", "chain", ".", "split", "right", ".", "focus", "--level=frame", "right",
            ],
        ]);
    });

    // autostart $ModShift-t — the FRAME LOGIC ONLY; the `spawn
    // $TERMINAL` half stays a dots concern (the dots keybind chains it).
    test("newFrame issues the split-auto-when-populated chain, WITHOUT the terminal spawn", async () => {
        await newFrame();
        expect(log()).toEqual([
            [
                "chain",
                ",", "or",
                ":", "and", ".", "compare", "tags.focus.curframe_wcount", "gt", "0",
                ".", "chain", "!", "split", "auto", "!", "cycle_frame",
                ":",
                "true",
            ],
        ]);
        const flat = log()[0].join(" ");
        expect(flat).not.toContain("spawn");
        expect(flat).not.toContain("TERMINAL");
    });

    // autostart $ModShift-q
    test("closeOrRemove issues the float-close / close_or_remove chain", async () => {
        await closeOrRemove();
        expect(log()).toEqual([
            [
                "or",
                ",", "and", ".", "compare", "clients.focus.floating", "=", "true",
                ".", "close",
                ",", "remove",
                ",", "close_or_remove",
            ],
        ]);
    });

    // autostart $ModCtrl-q
    test("xkillOrClose issues the xkill-or-close chain", async () => {
        await xkillOrClose();
        expect(log()).toEqual([
            [
                "or",
                ".", "and",
                ",", "attr", "clients.focus",
                ",", "spawn", "xkill",
                ".", "close_and_remove",
            ],
        ]);
    });

    // autostart $Mod-v
    test("splitRightCycle issues the split-right-half + cycle_frame chain", async () => {
        await splitRightCycle();
        expect(log()).toEqual([
            ["chain", ",", "split", "right", "0.5", ",", "cycle_frame"],
        ]);
    });

    // autostart $Mod-b
    test("focusFrameDown issues the focus-down / split-bottom+cycle chain", async () => {
        await focusFrameDown();
        expect(log()).toEqual([
            [
                "or",
                "!", "focus", "--level=frame", "down",
                "!", "chain", ",", "split", "bottom", "0.5", ",", "cycle_frame",
            ],
        ]);
    });

    // autostart $ModCtrl-v
    test("splitRightFocus issues the split-right-half + focus -e right chain", async () => {
        await splitRightFocus();
        expect(log()).toEqual([
            ["chain", ",", "split", "right", "0.5", ",", "focus", "-e", "right"],
        ]);
    });

    // autostart $ModCtrl-b
    test("splitBottomFocus issues the split-bottom-half + focus -i down chain", async () => {
        await splitBottomFocus();
        expect(log()).toEqual([
            ["chain", ",", "split", "bottom", "0.5", ",", "focus", "-i", "down"],
        ]);
    });

    // floating.sh $Mod-q — the user-rewritten close semantics: on the
    // float layer, close; a frame holding exactly one client closes
    // WITH its frame; everything else falls to close_or_remove.
    test("closeWindow issues the close / close-and-remove / close-or-remove chain", async () => {
        await closeWindow();
        expect(log()).toEqual([
            [
                "chain", "!", "lock",
                "!", "or",
                ".", "and", ",", "compare", "tags.focus.floating_focused", "=", "true",
                ",", "close",
                ".", "and", ",", "compare", "tags.focus.curframe_wcount", "=", "1",
                ",", "close_and_remove",
                ".", "close_or_remove",
                "!", "unlock",
            ],
        ]);
    });

    // floating.sh $ModShift-f
    test("fullscreenToggle toggles fullscreen on the focused client", async () => {
        await fullscreenToggle();
        expect(log()).toEqual([["attr", "clients.focus.fullscreen", "toggle"]]);
    });

    // nav.sh $ModShift-z
    test("minimizeToggle toggles minimized on the focused client", async () => {
        await minimizeToggle();
        expect(log()).toEqual([["attr", "clients.focus.minimized", "toggle"]]);
    });
});

// The small imperatives (shared building blocks of the state machines).
describe("small imperatives", () => {
    test("unfloatWid folds the flags and jumptos", async () => {
        await unfloatWid("0x1000001");
        expect(log()).toEqual([
            [
                "chain",
                ",", "attr", "clients.0x1000001.fullscreen", "off",
                ",", "attr", "clients.0x1000001.pseudotile", "off",
                ",", "attr", "clients.0x1000001.floating", "off",
            ],
            ["jumpto", "0x1000001"],
        ]);
    });

    test("minimizeKeepFrame minimizes without touching the frame", async () => {
        await minimizeKeepFrame("0x1000003");
        expect(log()).toEqual([["set_attr", "clients.0x1000003.minimized", "true"]]);
    });

    // removeEmptyFrame reads its counts through herbstutil's parseAttr
    // (attrValue) — the herbstutil integration surface.
    test("removeEmptyFrame: >1 frame + empty focused frame -> remove", async () => {
        scenario([
            ["^attr tags\\.focus\\.frame_count$", "0", "2"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "0"],
        ]);
        await removeEmptyFrame();
        expect(log()).toEqual([
            ["attr", "tags.focus.frame_count"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"],
            ["remove"],
        ]);
    });

    test("removeEmptyFrame: single frame -> no reads past the first", async () => {
        scenario([["^attr tags\\.focus\\.frame_count$", "0", "1"]]);
        await removeEmptyFrame();
        expect(log()).toEqual([["attr", "tags.focus.frame_count"]]);
    });

    test("removeEmptyFrame: populated focused frame -> no remove", async () => {
        scenario([
            ["^attr tags\\.focus\\.frame_count$", "0", "3"],
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "2"],
        ]);
        await removeEmptyFrame();
        const entries = log();
        expect(entries).not.toContainEqual(["remove"]);
        expect(entries).toEqual([
            ["attr", "tags.focus.frame_count"],
            ["attr", "tags.focus.tiling.focused_frame.client_count"],
        ]);
    });

    test("removeEmptyFrame: unreadable reads fall back to 1 (no remove, no throw)", async () => {
        scenario([
            ["^attr tags\\.focus\\.frame_count$", "1", ""],
        ]);
        await removeEmptyFrame();
        expect(log()).toEqual([["attr", "tags.focus.frame_count"]]);
    });
});

// The CLI verbs: every functional name is registered, and dispatching
// a command object runs the same chain the function does.
describe("CLI verbs", () => {
    test("all 22 chain verbs are registered under their functional names", async () => {
        const mod = await import("../src/commands/get-deck");
        const names: string[] = [];
        for (const verb of ["get-south", "get-forward", "get-deck", "get-dedeck", "explode-frame",
            "focus-frame-left", "shift-up", "rotate-tree", "shift-down", "split-down",
            "shift-left", "shift-right", "new-frame", "close-or-remove", "xkill-or-close",
            "split-right-cycle", "focus-frame-down", "split-right-focus", "split-bottom-focus", "close-window",
            "fullscreen-toggle", "minimize-toggle"]) {
            const cmd = (await import(`../src/commands/${verb}`)).default;
            names.push(String((cmd as { name: string }).name));
        }
        expect(names).toEqual([
            "get-south", "get-forward", "get-deck", "get-dedeck", "explode-frame",
            "focus-frame-left", "shift-up", "rotate-tree", "shift-down", "split-down",
            "shift-left", "shift-right", "new-frame", "close-or-remove", "xkill-or-close",
            "split-right-cycle", "focus-frame-down", "split-right-focus", "split-bottom-focus", "close-window",
            "fullscreen-toggle", "minimize-toggle",
        ]);
        expect(mod.default).toBeDefined();
    });

    test("the get-deck verb dispatches the same chain as the function", async () => {
        const { default: deck } = await import("../src/commands/get-deck");
        await (deck as unknown as { handler: (i: never) => Promise<void> }).handler(undefined as never);
        expect(log()).toEqual([
            [
                "or",
                ",", "and",
                ".", "compare", "tags.focus.curframe_wcount", "gt", "3",
                ".", "cycle_layout", "+1", "max", "vertical", "grid", "horizontal",
                ",", "and",
                ".", "compare", "tags.focus.curframe_wcount", "=", "2",
                ".", "cycle_layout", "+1", "vertical", "max", "horizontal",
                ",", "cycle_layout", "-1", "vertical", "horizontal", "max",
            ],
        ]);
    });
});
