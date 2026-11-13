// tests/verbs.test.ts — the compositional verb grammar: the layer
// modifiers (--to-float / --to-tiling / --foreground) applied around
// the atomic geometry verbs, under ONE lock — and the bare (no
// modifier) path staying lock-free. Same mock harness as the other
// suites (fixtures/mock-bin via PATH + HERBSTCTL_HELPER_DIR).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import center from "../src/commands/center";
import move from "../src/commands/move";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

// The scenario file is LINE-based — multi-line attrTree dumps travel
// as literal \n escapes (the mock's printf %b expands them).
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
        .filter((l) => l.includes("\x1f"))
        .map((l) => l.split("\x1f").slice(0, -1));
}

function scenario(rows: Array<[string, string, string]>): void {
    writeFileSync(scenarioPath, rows.map((r) => r.join("\t")).join("\n") + "\n");
}

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "herbctl-verbs-"));
    logPath = join(tmp, "mock.log");
    scenarioPath = join(tmp, "mock.scenario");
    writeFileSync(logPath, "");
    for (const f of ["herbstclient", "hc_center", "hc_resize", "hc_fit_to"]) {
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

// The modifier grammar: composed sequences (one lock) and the bare
// path (no lock, no extra writes).
describe("verb layer modifiers", () => {
    test("center --to-float --foreground root: ONE lock, float on, place, foreground", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1000x800+0+0"],
            ["^attr clients\\.0x1000001\\.floating_geometry$", "0", "500x400+2+24"],
            ["^attr clients\\.0x1000001\\.content_geometry$", "0", "500x400+250+211"],
        ]);
        await (center as unknown as {
            handler: (ctx: unknown) => Promise<void>;
        }).handler({ flags: { "to-float": true, foreground: true }, positional: ["root"] });
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["lock"],
            ["set_attr", "clients.0x1000001.floating", "on"], // --to-float
            // the atomic place: geometry, deco, adopted size, write,
            // stable reconcile
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating."],
            ["attr", "clients.0x1000001.floating_geometry"],
            ["set_attr", "clients.0x1000001.floating_geometry", "500x400+250+211"],
            ["attr", "clients.0x1000001.content_geometry"],
            // --foreground: the float-session foreground chain
            ["chain", ".", "try", "set_attr", "tags.focus.floating_focused", "on", ".",
             "jumpto", "0x1000001", ".", "bring", "0x1000001"],
            ["unlock"],
        ]);
    });

    test("center bare: NO lock, the atomic move only", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000002"],
            ["^attr theme\\.floating\\.$", "0", THEME_TREE],
            ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1000x800+0+0"],
            ["^attr clients\\.0x1000002\\.floating_geometry$", "0", "500x400+2+24"],
            ["^attr clients\\.0x1000002\\.content_geometry$", "0", "500x400+250+211"],
        ]);
        await (center as unknown as {
            handler: (ctx: unknown) => Promise<void>;
        }).handler({ flags: {}, positional: ["root"] });
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["attr", "tags.focus.tiling.root.content_geometry"],
            ["attr", "theme.floating."],
            ["attr", "clients.0x1000002.floating_geometry"],
            ["set_attr", "clients.0x1000002.floating_geometry", "500x400+250+211"],
            ["attr", "clients.0x1000002.content_geometry"],
        ]);
    });

    test("move --to-tiling: ONE lock, the un-float chain, no geometry", async () => {
        scenario([
            ["^attr clients\\.focus\\.winid$", "0", "0x1000003"],
        ]);
        await (move as unknown as {
            handler: (ctx: unknown) => Promise<void>;
        }).handler({ flags: { "to-tiling": true }, positional: [] });
        expect(log()).toEqual([
            ["attr", "clients.focus.winid"],
            ["lock"],
            ["chain",
                ",", "attr", "clients.0x1000003.fullscreen", "off",
                ",", "attr", "clients.0x1000003.pseudotile", "off",
                ",", "attr", "clients.0x1000003.floating", "off"],
            ["unlock"],
        ]);
    });

    test("move with no modifiers -> loud usage error", async () => {
        expect(() =>
            (move as unknown as { handler: (ctx: unknown) => Promise<void> })
                .handler({ flags: {}, positional: [] }),
        ).toThrow("nothing to do");
    });
});
