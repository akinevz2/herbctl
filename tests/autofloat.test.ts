// tests/autofloat.test.ts — the geometry verbs' auto-float contract,
// tested at the OUTCOME level (not command-sequence replication):
// given a mocked herbstclient, a verb run on a TILED focused window
// FLOATS it first; --floating-only SKIPS (no float write, no
// geometry op); an already-floating window proceeds untouched.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import center from "../src/lib/center";

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
    tmp = mkdtempSync(join(tmpdir(), "herbctl-autofloat-"));
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

/** The outcomes that matter, from the command log. */
const floated = (): boolean => log().some((c) =>
    c[0] === "set_attr" && c[1]?.endsWith(".floating") && c[2] === "on");
const locked = (): boolean => log().some((c) => c[0] === "lock");
const centered = (): boolean => log().some((c) =>
    c[0]?.startsWith("hc_center") || c[0] === "herbstclient" && false);

d();

function d(): void {
    describe("the geometry verbs' auto-float contract", () => {
        test("a TILED focused window is floated first (one floating write), then centered", async () => {
            scenario([
                ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
                ["^attr clients\\.0x1000001\\.floating$", "0", "false"],
                ["^attr theme\\.floating\\.", "0", "2"],
                ["^attr theme\\.", "0", "2"],
                ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1000x800+0+0"],
            ]);
            await (center as unknown as {
                handler: (ctx: unknown) => Promise<void>;
            }).handler({ flags: {}, positional: ["root"] });
            expect(floated()).toBe(true);       // the auto-float
            expect(locked()).toBe(false);       // the bare path stays lock-free
        });

        test("--floating-only: a tiled window is SKIPPED — no float write, no geometry op", async () => {
            scenario([
                ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
                ["^attr clients\\.0x1000001\\.floating$", "0", "false"],
            ]);
            await (center as unknown as {
                handler: (ctx: unknown) => Promise<void>;
            }).handler({ flags: { "floating-only": true }, positional: ["root"] });
            expect(floated()).toBe(false);      // never promoted
            expect(locked()).toBe(false);       // the verb never ran
        });

        test("an ALREADY-floating window proceeds untouched (no float write)", async () => {
            scenario([
                ["^attr clients\\.focus\\.winid$", "0", "0x1000001"],
                ["^attr clients\\.0x1000001\\.floating$", "0", "true"],
                ["^attr theme\\.floating\\.", "0", "2"],
                ["^attr theme\\.", "0", "2"],
                ["^attr tags\\.focus\\.tiling\\.root\\.content_geometry$", "0", "1000x800+0+0"],
            ]);
            await (center as unknown as {
                handler: (ctx: unknown) => Promise<void>;
            }).handler({ flags: {}, positional: ["root"] });
            expect(floated()).toBe(false);      // already floating — no write
        });
    });
}
