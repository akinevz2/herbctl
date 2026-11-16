// tests/expand.test.ts — the expand state machine (src/lib/expand.ts):
// max the focused frame's split ratio; at the maximum, remove the
// adjacent empty split. Same mocked-herbstclient harness as the other
// suites (fixtures/mock-bin via PATH + HERBSTCTL_HELPER_DIR).
//
// NOTE on the harness: the mock answers with the FIRST matching
// scenario row on EVERY call (rows are not consumed) — the scenario
// regexes here are unique per DISTINCT argv, and loops that replay the
// same argv replay the same rows (asserted literally below).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expandSplit } from "../src/lib/expand";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

// The scenario file is LINE-based — multi-line attrTree dumps travel
// as literal \n escapes (the mock's printf %b expands them).

/** Split node subtree: split_type + fraction + selection + children. */
const SPLIT = (fraction: string, selection: string) => [
    "2 children:",
    "  0.",
    "  1.",
    "5 attributes:",
    " R - h content_geometry = 1803x1113+2+2",
    ` d w - fraction = ${fraction}`,
    ' s - - index = ""',
    ` i w - selection = ${selection}`,
    " n w - split_type = horizontal",
].join("\\n");

/** Leaf frame subtree. */
const LEAF = (clients: number) => [
    "0 children.",
    "5 attributes:",
    " n w - algorithm = vertical",
    ` i - - client_count = ${clients}`,
    " R - h content_geometry = 900x1109+4+4",
    ' s - - index = "1"',
    " i w - selection = 0",
].join("\\n");

let tmp = "";
let logPath = "";
let scenarioPath = "";
let savedPath = "";
let savedHelperDir: string | undefined;

function log(): string[][] {
    return readFileSync(logPath, "utf8")
        .split("\n")
        .filter((l) => l.includes("\x1f"))
        .map((l) => l.split("\x1f").slice(0, -1));
}

function scenario(rows: Array<[string, string, string]>): void {
    writeFileSync(scenarioPath, rows.map((r) => r.join("\t")).join("\n") + "\n");
}

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "herbctl-expand-"));
    logPath = join(tmp, "mock.log");
    scenarioPath = join(tmp, "mock.scenario");
    writeFileSync(logPath, "");
    chmodSync(join(FIX, "herbstclient"), 0o755);
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

describe("expandSplit", () => {
    test("single frame (unsplit root) -> fail-soft false", async () => {
        scenario([
            ["^attr tags\\.focus\\.tiling\\.root$", "0", LEAF(2)],
        ]);
        expect(await expandSplit()).toBe(false);
        expect(log()).toEqual([
            ["lock"],
            ["attr", "tags.focus.tiling.root"],
            ["unlock"],
        ]);
    });

    test("child 0 below the max: set fraction to 0.95, done (no remove)", async () => {
        scenario([
            ["^attr tags\\.focus\\.tiling\\.root$", "0", SPLIT("0.5", "0")],
            ["^attr tags\\.focus\\.tiling\\.root\\.0$", "0", LEAF(2)],
            ["^set_attr tags\\.focus\\.tiling\\.root\\.fraction 0\\.95$", "0", ""],
            ["^get_attr tags\\.focus\\.tiling\\.root\\.fraction$", "0", "0.95"],
        ]);
        expect(await expandSplit()).toBe(true);
        expect(log()).toEqual([
            ["lock"],
            ["attr", "tags.focus.tiling.root"],
            ["attr", "tags.focus.tiling.root.0"],
            ["set_attr", "tags.focus.tiling.root.fraction", "0.95"],
            ["get_attr", "tags.focus.tiling.root.fraction"],
            ["unlock"],
        ]);
    });

    test("child 1: expanding means lowering the fraction to 0.05 (the complement share)", async () => {
        scenario([
            ["^attr tags\\.focus\\.tiling\\.root$", "0", SPLIT("0.5", "1")],
            ["^attr tags\\.focus\\.tiling\\.root\\.1$", "0", LEAF(2)],
            ["^set_attr tags\\.focus\\.tiling\\.root\\.fraction 0\\.05$", "0", ""],
            ["^get_attr tags\\.focus\\.tiling\\.root\\.fraction$", "0", "0.05"],
        ]);
        expect(await expandSplit()).toBe(true);
        expect(log()).toContainEqual([
            "set_attr", "tags.focus.tiling.root.fraction", "0.05",
        ]);
        expect(log()).not.toContainEqual(["remove"]);
    });

    test("already maxed + empty sibling: frame_focus + remove collapse", async () => {
        // The mock replays the same rows on every call, so the loop's
        // re-walks see the same (still-split, still-empty) shape: 6
        // guarded rounds of the same collapse, deterministic.
        const round = [
            ["attr", "tags.focus.tiling.root"],
            ["attr", "tags.focus.tiling.root.0"],
            ["set_attr", "tags.focus.tiling.root.fraction", "0.95"],
            ["get_attr", "tags.focus.tiling.root.fraction"],
            ["attr", "tags.focus.tiling.root.1"],
            ["frame_focus", "right"],
            ["remove"],
        ];
        scenario([
            ["^attr tags\\.focus\\.tiling\\.root$", "0", SPLIT("0.95", "0")],
            ["^attr tags\\.focus\\.tiling\\.root\\.0$", "0", LEAF(2)],
            ["^set_attr tags\\.focus\\.tiling\\.root\\.fraction 0\\.95$", "0", ""],
            ["^get_attr tags\\.focus\\.tiling\\.root\\.fraction$", "0", "0.95"],
            ["^attr tags\\.focus\\.tiling\\.root\\.1$", "0", LEAF(0)],
            ["^frame_focus right$", "0", ""],
            ["^remove$", "0", ""],
        ]);
        expect(await expandSplit()).toBe(true);
        expect(log()).toEqual([
            ["lock"],
            ...Array(6).fill(round).flat(),
            ["unlock"],
        ]);
    });

    test("already maxed + sibling WITH clients: no remove (fail-soft no-op)", async () => {
        scenario([
            ["^attr tags\\.focus\\.tiling\\.root$", "0", SPLIT("0.95", "0")],
            ["^attr tags\\.focus\\.tiling\\.root\\.0$", "0", LEAF(2)],
            ["^set_attr tags\\.focus\\.tiling\\.root\\.fraction 0\\.95$", "0", ""],
            ["^get_attr tags\\.focus\\.tiling\\.root\\.fraction$", "0", "0.95"],
            ["^attr tags\\.focus\\.tiling\\.root\\.1$", "0", LEAF(1)],
        ]);
        expect(await expandSplit()).toBe(true);
        expect(log()).not.toContainEqual(["remove"]);
    });
});
