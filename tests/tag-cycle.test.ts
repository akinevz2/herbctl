// tests/tag-cycle.test.ts — the tagspace cycler (jump prev/next; the
// hc_tag-cycle reference implementation), tested at the OUTCOME level
// against a mocked herbstclient: the walker reads ONE tag_status plus
// tags.focus.index and issues `use <name>` on the first populated
// candidate, skipping unoccupied tags AND tags visible on another
// monitor, wrapping around the ring, and STAYING PUT when no other
// populated tag exists (the script's exit-0-and-stay).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { tagCycle } from "../src/lib/chains";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

let tmp = "";
let logPath = "";
let scenarioPath = "";
let savedPath = "";

function log(): string[][] {
    return readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const parts = line.split("\x1f");
            return parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
        });
}

/** The `use` calls, verbatim (the only WM write the walker issues). */
const uses = (): string[] =>
    log().filter((c) => c[0] === "use").map((c) => c[1] ?? "");

function scenario(rows: Array<[string, string, string]>): void {
    writeFileSync(scenarioPath, rows.map((r) => r.join("\t")).join("\n") + "\n");
}

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "herbctl-tag-cycle-"));
    logPath = join(tmp, "mock.log");
    scenarioPath = join(tmp, "mock.scenario");
    writeFileSync(logPath, "");
    chmodSync(join(FIX, "herbstclient"), 0o755);
    savedPath = process.env.PATH ?? "";
    process.env.PATH = `${FIX}:${savedPath}`;
    process.env.HERBSTCTL_MOCK_LOG = logPath;
    process.env.HERBSTCTL_MOCK_SCENARIO = scenarioPath;
});

afterEach(() => {
    process.env.PATH = savedPath;
    delete process.env.HERBSTCTL_MOCK_LOG;
    delete process.env.HERBSTCTL_MOCK_SCENARIO;
    rmSync(tmp, { recursive: true, force: true });
});

/** A WM state: the tag_status line (one <char><name> per tab field)
 *  plus the focused tag's index. */
function wm(status: string, focusIndex: string): void {
    // The mock prints the out field through printf %b — \t escapes
    // become real tabs (the scenario format cannot hold literal tabs).
    scenario([
        ["^tag_status$", "0", status.replace(/\t/g, "\\t")],
        ["^attr tags\\.focus\\.index$", "0", focusIndex],
    ]);
}

describe("the tagspace cycler (jump prev/next)", () => {
    test("next skips unoccupied tags and enters the next populated one", async () => {
        wm("\t:one\t.empty\t:three", "0");
        expect(await tagCycle(1)).toBe("three");
        expect(uses()).toEqual(["three"]);
    });

    test("prev wraps around the ring, skipping empty and visible tags", async () => {
        // Focused: index 3. prev skips '*other' (visible on another
        // monitor — the old --skip-visible semantics) and '.empty',
        // then wraps to index 0.
        wm("\t:one\t.empty\t*other\t!four", "3");
        expect(await tagCycle(-1)).toBe("one");
        expect(uses()).toEqual(["one"]);
    });

    test("urgent tags ('!') are candidates", async () => {
        wm("\t:one\t!urgent", "0");
        expect(await tagCycle(1)).toBe("urgent");
        expect(uses()).toEqual(["urgent"]);
    });

    test("no populated tag besides the current one — stay put", async () => {
        wm("\t#one\t.empty\t.also-empty", "0");
        expect(await tagCycle(1)).toBeNull();
        expect(uses()).toEqual([]);
    });

    test("an unreachable WM stays put (fail-soft, no use)", async () => {
        scenario([["^tag_status$", "1", ""]]);
        expect(await tagCycle(1)).toBeNull();
        expect(uses()).toEqual([]);
    });
});
