// tests/live.hidden.test.ts — OPTIONAL live-session tests for the
// hidden picker (the mod-g machine, lib/hidden.ts): they run against
// the REAL herbstluftwm session and are skipped unless
// HERBCTL_LIVE_TESTS=1.
//
//   HERBCTL_LIVE_TESTS=1 bun test tests/live.hidden.test.ts
//
// The probe-tag pattern (see tests/live.test.ts for the full
// doctrine): the orchestrator is brought onto the probe tag and
// FLOATS over the experiment; probe windows are `herbctl terminal`
// (alacritty) spawns with DISTINCT -d DIRECTORIES — the directory is
// the identification contract: alacritty's WM title reads
// "bash <dir>", so the probes are told apart by TITLE (the dir
// basename), never by spawn order or class. The starting tag is
// restored and the probe tag merged away ONCE at afterAll.
//
// What is MEASURED (not assumed), per the regression this pins:
//   - exactly ONE hidden client is REVEALED directly — minimized
//     flips false in the real WM attrs and the client ends up
//     FOCUSED (bring). The row-blob miscount showed the menu
//     instead; the typed-attr bug (minimized reads back a real
//     boolean, never "true") emptied the hidden list entirely —
//     BOTH are pinned here, against the live WM.
//   - hiddenRows() emits ONE urgent-styled script-mode row per
//     minimized client (the display\0meta shape, info carrying the
//     wid).
//
// The >1-hidden menu branch and the no-hidden windows-fallback open
// are INTERACTIVE (they exec rofi and block) — deliberately never
// exercised live.

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    test,
} from "bun:test";
import { mkdirSync } from "node:fs";

import { attrValue, hc, listClients, setAttr } from "../src/lib/hc";
import { hiddenMenu, hiddenRows } from "../src/lib/hidden";
import { launchTerminal } from "../src/lib/terminal";
import { ensureOrchestratorOn, ensureTestTag } from "../src/lib/probe";

const PROBE_TAG = "herbctl-live-hidden";
/** The probe directories — their BASENAMES are the title contract. */
const PROBE_A_DIR = "/tmp/opencode/hprobe-a";
const PROBE_B_DIR = "/tmp/opencode/hprobe-b";

const LIVE = process.env.HERBCTL_LIVE_TESTS === "1";
const d = LIVE ? describe : describe.skip;

/** Wait until the predicate holds against the REAL WM attrs (the
 *  reveal writes race the WM's async apply — poll the leaf, not the
 *  hope). Budget: ~8 s. */
async function until(
    what: string,
    probe: () => Promise<boolean>,
): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
        if (await probe()) return;
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timeout waiting for: ${what}`);
}

/** The probe client for a directory: the ONE client whose title
 *  carries the dir basename (alacritty: "bash <dir>"). */
async function probeWid(dir: string): Promise<string> {
    const base = dir.split("/").filter(Boolean).pop() ?? dir;
    for (const w of await listClients()) {
        const t = (await attrValue<string>(`clients.${w}.title`)) ?? "";
        if (t.includes(base)) return w;
    }
    return "";
}

d("hidden picker (live)", () => {
    let startTag = "work";
    let orchWid = "";
    const pids: number[] = [];

    beforeAll(async () => {
        mkdirSync(PROBE_A_DIR, { recursive: true });
        mkdirSync(PROBE_B_DIR, { recursive: true });
        const run = await ensureTestTag(PROBE_TAG);
        startTag = run.startTag;
        orchWid = run.wid;
    }, 30_000);

    afterAll(async () => {
        // probe terminals down (the wrapper's bash dies with the
        // terminal), the orchestrator back up and focused, the view
        // restored, the probe tag merged away ONCE
        for (const pid of pids) {
            try { process.kill(pid); } catch { /* gone */ }
        }
        await new Promise((r) => setTimeout(r, 300));
        if (orchWid !== "") {
            await setAttr(`clients.${orchWid}.minimized`, false);
            await hc("jumpto", orchWid);
        }
        await hc("use", startTag);
        await new Promise((r) => setTimeout(r, 150));
        await hc("merge_tag", PROBE_TAG, startTag);
    }, 30_000);

    test("exactly ONE hidden client -> revealed directly, no menu", async () => {
        // spawn TWO probes (distinct directories = distinct titles):
        // one stays visible (an unminimized "other" window — the
        // fallback branch must NOT fire), one gets minimized
        for (const dir of [PROBE_A_DIR, PROBE_B_DIR]) {
            const pid = await launchTerminal({ directory: dir });
            expect(pid).not.toBeNull();
            pids.push(pid as number);
        }
        let a = "";
        let b = "";
        await until("two probes titled", async () => {
            a = await probeWid(PROBE_A_DIR);
            b = await probeWid(PROBE_B_DIR);
            return a !== "" && b !== "";
        });
        expect(a).not.toBe(b);
        expect(a).not.toBe(orchWid);
        expect(b).not.toBe(orchWid);

        // minimize exactly ONE of them (the machine under test) —
        // herbstutil TYPES the read: a real boolean, never "true"
        await setAttr(`clients.${a}.minimized`, true);
        await until("a is minimized", async () =>
            (await attrValue<boolean>(`clients.${a}.minimized`)) === true);

        // the row contract first: ONE hidden client -> ONE urgent row
        const rows = await hiddenRows();
        const rowCount = rows.split("\n").filter((l) => l.includes("\x00")).length;
        expect(rowCount).toBe(1);
        expect(rows).toContain("urgent\x1ftrue");
        expect(rows).toContain(`info\x1f${a}`);

        // THE MACHINE: bare reveal — no menu, no rofi; minimized
        // flips false and the client ends up FOCUSED (bring)
        await hiddenMenu();
        await until("a is revealed", async () =>
            (await attrValue<boolean>(`clients.${a}.minimized`)) === false);
        const focused = await attrValue<string>("clients.focus.winid");
        expect(focused).toBe(a);

        // re-hide via the attribute (the test owns its state — the
        // toggle machine is not under test here)
        await setAttr(`clients.${a}.minimized`, true);
        await until("a re-hidden", async () =>
            (await attrValue<boolean>(`clients.${a}.minimized`)) === true);
    }, 60_000);

    test("the orchestrator gate survives the picker's focus move", async () => {
        // the reveal FOCUSED the probe client — hand focus back and
        // run the proceed gate (the afterEach contract, asserted
        // explicitly: the orchestrator is intact and ON the probe tag)
        await hc("jumpto", orchWid);
        const wid = await ensureOrchestratorOn(PROBE_TAG, startTag);
        expect(wid).toBe(orchWid);
    }, 30_000);
});
