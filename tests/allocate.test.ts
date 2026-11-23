// tests/allocate.test.ts — the new/add/close/focus allocation surface
// (src/lib/allocate.ts). The herbstclient + dots helper binaries are
// mocked via PATH (the tests/fixtures/mock-bin harness — same contract
// as chains.test.ts): every test asserts the recorded argv sequence;
// nothing here ever talks to a live herbstluftwm session.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    allocateTagspace,
    freeTagspaceName,
    allocateFrame,
    freeTagspace,
    allocateNotification,
    dismissNotifications,
    allocateTerminal,
    ensureTagspace,
} from "../src/lib/allocate";

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
    tmp = mkdtempSync(join(tmpdir(), "herbctl-allocate-"));
    logPath = join(tmp, "mock.log");
    scenarioPath = join(tmp, "mock.scenario");
    writeFileSync(logPath, "");
    for (const f of [
        "herbstclient", "dunstify-input", "hc_dismiss-notifs",
    ]) {
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

describe("tagspace allocation (hlwm tags)", () => {
    test("freeTagspaceName picks the first numeric gap", async () => {
        scenario([["list_tags", "0", "1\\n2\\n4"]]);
        expect(await freeTagspaceName()).toBe("3");
    });

    test("freeTagspaceName falls to N+1 when no gap", async () => {
        scenario([["list_tags", "0", "1\\n2\\n3"]]);
        expect(await freeTagspaceName()).toBe("4");
    });

    test("new tagspace: add + use (the smallest free numeric)", async () => {
        scenario([["list_tags", "0", "1\\n2"]]);
        const tag = await allocateTagspace(true);
        expect(tag).toBe("3");
        expect(log()).toContainEqual(["add", "3"]);
        expect(log()).toContainEqual(["use", "3"]);
    });

    test("add tagspace: add WITHOUT use (focus stays)", async () => {
        scenario([["list_tags", "0", "1\\n2"]]);
        const tag = await allocateTagspace(false);
        expect(tag).toBe("3");
        expect(log()).toContainEqual(["add", "3"]);
        expect(log().some((argv) => argv[0] === "use")).toBe(false);
    });

    test("new tagspace on an existing name degenerates to entry", async () => {
        scenario([["list_tags", "0", "1\\n2"]]);
        const tag = await allocateTagspace(true, "1");
        expect(tag).toBe("1");
        expect(log()).toContainEqual(["use", "1"]);
        expect(log().some((argv) => argv[0] === "add")).toBe(false);
    });

    test("close tagspace: clients move to the first other tag, then merge", async () => {
        scenario([
            ["list_tags", "0", "1\\n2\\n3"],
            ["attr tags.focus.name", "0", "2"],
            ["list_clients --tag=2", "0", "0x1\\n0x2"],
        ]);
        const tag = await freeTagspace();
        expect(tag).toBe("2");
        expect(log()).toContainEqual(["move", "0x1", "1"]);
        expect(log()).toContainEqual(["move", "0x2", "1"]);
        expect(log()).toContainEqual(["merge_tag", "2", "1"]);
    });
});

describe("frame allocation", () => {
    test("new frame: the migrated newFrame chain (split + cycle)", async () => {
        await allocateFrame(true);
        const argv = log()[0];
        expect(argv).toContain("split");
        expect(argv).toContain("cycle_frame");
    });

    test("add frame: a bare split — focus stays on the client", async () => {
        await allocateFrame(false);
        expect(log()).toEqual([["split", "auto"]]);
    });
});

describe("notification allocation (no keyboard focus: new/add identical)", () => {
    test("allocate raises dunst via the dots helper", async () => {
        const ok = await allocateNotification();
        expect(ok).toBe(true);
        expect(log()[0].join(" ")).toContain("herbctl: notification allocated");
    });

    test("close notification dismisses via the dots helper", async () => {
        expect(await dismissNotifications()).toBe(true);
        // the no-arg helper call logs an empty argv line — the raw file
        // is the evidence (log() filters blank lines)
        expect(readFileSync(logPath, "utf8").length).toBeGreaterThan(0);
    });
});

describe("remote-tagspace allocation (--on, focus-stealing prevented)", () => {
    test("ensureTagspace creates a missing hlwm tag", async () => {
        scenario([["list_tags", "0", "1\\n2"]]);
        expect(await ensureTagspace("notes")).toBe(true);
        expect(log()).toContainEqual(["add", "notes"]);
    });

    test("ensureTagspace leaves an existing one alone", async () => {
        scenario([["list_tags", "0", "1\\nnotes"]]);
        expect(await ensureTagspace("notes")).toBe(true);
        expect(log().some((argv) => argv[0] === "add")).toBe(false);
    });

    test("the --on once-rule pins tag + focus=off + switchtag=off", async () => {
        process.env.TERMINAL = "alacritty";
        scenario([
            ["attr clients.focus.winid", "0", "0x9"],
            ["list_tags", "0", "1\\n2\\nnotes"],
        ]);
        const pid = await allocateTerminal(true, undefined, { on: "notes" });
        expect(pid).not.toBeNull();
        const rule = log().find((argv) => argv[0] === "rule");
        expect(rule).toBeDefined();
        expect(rule).toContain("tag=notes");
        expect(rule).toContain("focus=off");
        expect(rule).toContain("switchtag=off");
        // the focus-steal guard: the previously focused client is kept
        expect(log().some((argv) => argv[0] === "jumpto")).toBe(false);
    });
});
