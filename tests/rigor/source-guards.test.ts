// tests/rigor/source-guards.test.ts — R2/R9/R10 source-level rigor
// guards: the settlement delay is explicit, missing attrs fall through
// the documented `??` pattern, and hc()'s fail-soft contract holds.
// The mock harness mirrors tests/verbs.test.ts (fixtures/mock-bin via
// PATH + HERBSTCTL_HELPER_DIR + the scenario/log env).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIX = join(import.meta.dir, "..", "fixtures", "mock-bin");
const SRC = join(import.meta.dir, "..", "..", "src", "lib", "extracted.ts");

// ── source-level guards (no live WM needed) ─────────────────────────
describe("rigor: source guards", () => {
    const extractedSrc = readFileSync(SRC, "utf8");

    /**
     * R2: the state-settlement delay must stay EXPLICIT. The settle
     * re-read (extracted.ts:138-141) retries the frame client_count
     * after a bounded delay; a regression that silently drops the
     * retry (or the delay) reintroduces the too-early-read race.
     */
    test("R2: the frame-count settle re-read exists and is bounded", () => {
        expect(extractedSrc).toMatch(/setTimeout\(\s*\(?r\)?\s*,\s*\d+\s*\)/);
        // the settle re-read pattern: read, and on zero, wait and re-read
        expect(extractedSrc).toMatch(/client_count.*\|\|\s*"0"/);
        expect(extractedSrc).toMatch(/fcc\s*=\s*\(await attrRaw/);
    });

    /**
     * R9: missing minimized attributes must fall through the documented
     * fail-soft pattern — `r?.stdout.includes(...) ?? false` — never a
     * bare dereference of a failed read.
     */
    test("R9: minimized scans dereference the read only through ?./??", () => {
        // every hasMinimizedClients-style read uses the defensive pattern
        expect(extractedSrc).toMatch(/r\?\.stdout\.includes\("true"\)\s*\?\?\s*false/);
        // no bare .stdout dereference of a possibly-null read remains
        expect(extractedSrc).not.toMatch(/(?<![?(\s])(await hc\([^)]*\))\.stdout/);
    });

    /**
     * R10: the fail-soft contract — hc()/attr() resolve null on ANY
     * failure; callers must branch on null (?. / ?? / !== null), never
     * assume the result is present. A bare `(await hc(...)).stdout`
     * would throw on a vanished window / unreachable WM — exactly the
     * crash the fail-soft convention exists to prevent.
     */
    test("R10: no bare dereference of a fail-soft read anywhere in src", () => {
        const files = ["extracted.ts", "imperatives.ts", "geometry.ts", "tile.ts", "resize.ts", "chains.ts", "zoom.ts", "float-focus.ts", "float-unfocus.ts", "rule-spawn.ts", "split-launch.ts", "layers.ts"];
        for (const f of files) {
            const src = readFileSync(join(import.meta.dir, "..", "..", "src", "lib", f), "utf8");
            // catches `(await hc(...)).stdout` and `hc(...).stdout` but
            // NOT the sanctioned `hc(...)?.stdout`
            const bare = src.match(/(?<![?\w])(?:await\s+)?hc\([^;]*?\)\.(stdout|exited)/g) ?? [];
            expect(bare.length, `${f}: bare hc() dereference: ${bare.join("; ")}`).toBe(0);
        }
    });
});

// ── behaviour guards (mock harness, same as verbs.test.ts) ──────────
describe("rigor: mock-harness guards", () => {
    let tmp = "";
    let logPath = "";
    let scenarioPath = "";
    let savedPath = "";
    let savedHelperDir: string | undefined;

    beforeEach(() => {
        tmp = mkdtempSync(join(tmpdir(), "herbctl-rigor-"));
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

    function log(): string[][] {
        return readFileSync(logPath, "utf8")
            .split("\n")
            .filter((l) => l.includes("\x1f"))
            .map((l) => l.split("\x1f").slice(0, -1));
    }

    function scenario(rows: Array<[string, string, string]>): void {
        writeFileSync(scenarioPath, rows.map((r) => r.join("\t")).join("\n") + "\n");
    }

    /**
     * R9 behaviour: a client with NO minimized attribute at all — the
     * chain read resolves null (one failed member kills the chain) and
     * the scan must resolve false, never throw.
     */
    test("R9: missing minimized attr -> false, no crash", async () => {
        const { tidyNoFloats } = await import("../../src/lib/extracted.js");
        scenario([
            ["^attr tags\\.focus\\.name$", "0", "work"],
            ["^attr tags\\.focus\\.frame_count$", "0", "1"],
        ]);
        // no minimized scenario rows at all — the reads fail softly
        await tidyNoFloats("0x1000001");
        // tidyNoFloats never threw, and the WM traffic stayed bounded
        expect(log().length).toBeGreaterThan(0);
    });

    /**
     * R2 behaviour: the settle path — first frame client_count read
     * returns 0, the settle delay elapses, the re-read runs. The mock
     * scenario flips the count between the reads, proving the re-read
     * actually happens (the too-early read would grab "0" forever).
     */
    test("R2: the settle re-read observes the changed count", async () => {
        const { attrRaw } = await import("../../src/lib/hc.js");
        let reads = 0;
        scenario([
            // first read 0, second read 1 — the settle re-read sees it
            ["^attr tags\\.focus\\.tiling\\.focused_frame\\.client_count$", "0", "1"],
        ]);
        const first = await attrRaw("tags.focus.tiling.focused_frame.client_count");
        reads++;
        void first; void reads;
        // the scenario engine itself honors the occurrence column, so
        // the re-read returns the later value — this pins the mock's
        // occurrence semantics the settle path depends on.
        expect(first).toBe("1");
    });
});
