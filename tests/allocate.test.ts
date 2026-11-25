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
    allocateTag,
    freeTagName,
    allocateFrame,
    freeTag,
    allocateNotification,
    dismissNotifications,
    allocateTerminal,
    ensureTag,
    listTags,
    tagIndexesFromDump,
    tagNameFromReply,
    tagNames,
} from "../src/lib/allocate";

const FIX = join(import.meta.dir, "fixtures", "mock-bin");

/** the REAL `herbstclient attr tags.` bytes (captured live, committed
 *  as the fixture): the correctness baseline for listTags. */
const TAGS_DUMP = readFileSync(join(import.meta.dir, "fixtures", "tags-dump.txt"), "utf8");
const TAG_NAMES = ["work", "term", "config", "logs", "task", "browser", "discord", "notes"];

/** the scenario rows that answer the listTags round trips: the
 *  child name reads FIRST (specific), then the top-level `attr tags.`
 *  dump (its regex must not swallow the child calls), and the erroring
 *  empty index slots (8, 9) that fail-soft to null. */
function tagsScenario(): Array<[string, string, string]> {
    const rows: Array<[string, string, string]> = [];
    TAG_NAMES.forEach((n, i) => {
        rows.push([`attr tags\\.${i}\\.name$`, "0", n]);
    });
    rows.push([`attr tags\\.[89]\\.name$`, "1", `attr: Object "tags" has no attribute "${9}"`]);
    rows.push(["attr tags\\.$", "0", TAGS_DUMP.replaceAll("\n", "\\n")]);
    return rows;
}


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

describe("tag parsing (string level — the real herbstclient bytes)", () => {
    test("tagIndexesFromDump reads the real attr tags. dump", () => {
        expect(tagIndexesFromDump(TAGS_DUMP)).toEqual([
            "0", "1", "2", "3", "4", "5", "6", "7", "by-name", "focus",
        ]);
    });

    test("tagNameFromReply reads the leaf value", () => {
        expect(tagNameFromReply("work\n")).toBe("work");
        // the empty reply IS the error signal (hc maps failures to "");
        // a non-empty error TEXT is indistinguishable from a name at
        // this level — the production call site never produces one
        expect(tagNameFromReply("")).toBeUndefined();
    });

    test("tagNames derives the names from the dump + replies", () => {
        const reply = (idx: string) =>
            Number.isInteger(Number(idx))
                ? TAG_NAMES[Number(idx)] ?? ""
                : "";
        expect(tagNames(TAGS_DUMP, reply)).toEqual(TAG_NAMES);
    });

    test("tagNames skips the empty index slots and mirrors", () => {
        const reply = (idx: string) =>
            Number.isInteger(Number(idx)) && Number(idx) < TAG_NAMES.length
                ? TAG_NAMES[Number(idx)]
                : "";
        // the focus mirror repeats "work" — deduped to one entry
        expect(tagNames(TAGS_DUMP, reply)).toEqual(TAG_NAMES);
    });

    test("tagNames sees a leaked numeric tag (the free-name gap moves)", () => {
        const leak = ["work", "1", "2"];
        const reply = (idx: string) =>
            Number.isInteger(Number(idx)) && Number(idx) < leak.length
                ? leak[Number(idx)]
                : "";
        expect(tagNames(TAGS_DUMP, reply)).toEqual(leak);
    });
});

describe("tag allocation (hlwm tags)", () => {
    test("listTags parses the real herbstclient attr tags. dump", async () => {
        scenario(tagsScenario());
        expect(await listTags()).toEqual(TAG_NAMES);
    });

    test("freeTagName picks the first free numeric (no numeric names)", async () => {
        scenario(tagsScenario());
        expect(await freeTagName()).toBe("1");
    });

    test("freeTagName skips taken numeric names", async () => {
        // the leaked-tag case: a numeric tag exists among the names
        const names = ["work", "1", "2"];
        const rows: Array<[string, string, string]> = [];
        names.forEach((n, i) =>
            rows.push([`attr tags\\.${i}\\.name$`, "0", n])),
        rows.push(["attr tags\\.$", "0", TAGS_DUMP.replaceAll("\n", "\\n")]);
        scenario(rows);
        expect(await freeTagName()).toBe("3");
    });

    test("new tag: add + use (the smallest free numeric)", async () => {
        scenario(tagsScenario());
        const tag = await allocateTag(true);
        expect(tag).toBe("1");
        expect(log()).toContainEqual(["add", "1"]);
        expect(log()).toContainEqual(["use", "1"]);
    });

    test("add tag: add WITHOUT use (focus stays)", async () => {
        scenario(tagsScenario());
        const tag = await allocateTag(false);
        expect(tag).toBe("1");
        expect(log()).toContainEqual(["add", "1"]);
        expect(log().some((argv) => argv[0] === "use")).toBe(false);
    });

    test("new tag on an existing name degenerates to entry", async () => {
        scenario(tagsScenario());
        const tag = await allocateTag(true, "work");
        expect(tag).toBe("work");
        expect(log()).toContainEqual(["use", "work"]);
        expect(log().some((argv) => argv[0] === "add")).toBe(false);
    });

    test("close tag: clients move to the first other tag, then merge", async () => {
        const rows: Array<[string, string, string]> = [
            ["attr tags.focus.name", "0", "work"],
            ["^attr clients\\.$", "0", "The managed windows. For every (managed) window id there is an entry here.\\n\\n2 children:\\n  0x1.\\n  0x2."],
            ["^attr clients\\.0x1\\.tag$", "0", "work"],
            ["^attr clients\\.0x2\\.tag$", "0", "work"],
        ];
        TAG_NAMES.forEach((n, i) =>
            rows.push([`attr tags\\.${i}\\.name$`, "0", n])),
        rows.push(["attr tags\\.$", "0", TAGS_DUMP.replaceAll("\n", "\\n")]);
        scenario(rows);
        const tag = await freeTag();
        expect(tag).toBe("work");
        expect(log()).toContainEqual(["move", "0x1", "term"]);
        expect(log()).toContainEqual(["move", "0x2", "term"]);
        expect(log()).toContainEqual(["merge_tag", "work", "term"]);
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

describe("remote-tag allocation (--on, focus-stealing prevented)", () => {
    test("ensureTag creates a missing hlwm tag", async () => {
        scenario(tagsScenario());
        expect(await ensureTag("zz-proto")).toBe(true);
        expect(log()).toContainEqual(["add", "zz-proto"]);
    });

    test("ensureTag leaves an existing one alone", async () => {
        scenario([
            ["attr tags\\.2\\.name$", "0", "notes"],
            ["attr tags\\.[0-7]\\.name$", "0", TAG_NAMES[0]],
            ["attr tags\\.$", "0", TAGS_DUMP.replaceAll("\n", "\\n")],
        ]);
        expect(await ensureTag("notes")).toBe(true);
        expect(log().some((argv) => argv[0] === "add")).toBe(false);
    });

    test("the --on once-rule pins tag + focus=off + switchtag=off", async () => {
        process.env.TERMINAL = "alacritty";
        scenario([
            ["attr clients.focus.winid", "0", "0x9"],
            ["attr tags\\.[0-7]\\.name$", "0", TAG_NAMES[0]],
            ["attr tags\\.$", "0", TAGS_DUMP.replaceAll("\n", "\\n")],
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
