// tests/live.test.ts — OPTIONAL live-session tests for the
// positioning/resizing routines (the fullHeight help-terminal
// geometry): they run against the REAL herbstluftwm session and are
// skipped unless HERBCTL_LIVE_TESTS=1.
//
//   HERBCTL_LIVE_TESTS=1 bun test tests/live.test.ts
//
// MONITORING: the ORCHESTRATOR (the opencode window the suite is
// launched from) is JUMPED onto the probe tag at setup — the user
// watches every test live, no tag-hopping. The routines under test
// read tags.focus.* by design (the help terminal positions on the
// user's view), and the split SETUP needs the focused tag, so each
// test focuses the probe tag for its duration and RESTORES the
// starting tag in afterEach. The probe tag is merged away; the probe
// window is killed; the orchestrator is restored unminimized.
//
// Where a test needs an effectively EMPTY tag (an unobstructed
// measurement surface), the orchestrator is MINIMIZED for the
// duration and brought back — accounted for, not assumed absent.
// Spawned probe windows are placed via rule consequences
// (focus=off), never stealing focus.
//
// What is measured (not assumed):
//   - floating_geometry is honored verbatim (rule applied)
//   - the computed rect is BOUNDED by the focused frame's content
//     geometry — half its width, centered horizontally
//   - the OUTER frame (content + the floating theme's title +
//     2*border) stays inside the frame vertically — the bottom edge
//     never lands off-screen (the overflow regression)
//   - the same containment holds in an above/below split

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from "bun:test";

import { attrValue, hc, listClients, setAttr } from "../src/lib/hc";
import { fullHeightRule, fullHeightTarget, launchTerminal } from "../src/lib/terminal";
import {
    ensureOrchestratorOn,
    ensureTestTag,
    resetTestTag,
} from "../src/lib/probe";

const PROBE_TAG = "herbctl-live-test";

const LIVE = process.env.HERBCTL_LIVE_TESTS === "1";
const d = LIVE ? describe : describe.skip;

interface Rect { w: number; h: number; x: number; y: number }

function parseGeom(s: string | null): Rect | null {
    if (s === null) return null;
    const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(s);
    if (!m) return null;
    const [, w, h, x, y] = m.map(Number) as [unknown, number, number, number, number];
    return { w, h, x, y };
}

/** The frame geometry that bounds the pager (the routine's anchor). */
async function frameGeom(): Promise<Rect> {
    const g = parseGeom(await attrValue<string>(
        "tags.focus.tiling.focused_frame.content_geometry",
    ));
    expect(g).not.toBeNull();
    return g as Rect;
}

d("fullHeight geometry (live)", () => {
    let startTag = "work";


    // SUITE-scoped setup: the testing tag is ensured ONCE, the
    // orchestrator moved onto it and it STAYS there for the whole
    // run (the user monitors live). Per-test, the tag is only RESET
    // (splits collapsed, strays closed, orchestrator re-focused) —
    // never evicted (the merge-away in an afterEach was the bug that
    // dragged the orchestrator back onto the user's tag every test).
    // Full restoration happens ONCE at afterAll.
    beforeAll(async () => {
        const run = await ensureTestTag(PROBE_TAG);
        startTag = run.startTag;
        await resetTestTag(PROBE_TAG);
    }, 30_000);

    beforeEach(async () => {
        await hc("spawn", "sh", "-c", "pkill xmessage || true");
    });
    afterEach(async () => {
        await hc("spawn", "sh", "-c", "pkill xmessage || true");
        // the proceed gate: the orchestrator intact and ON the
        // testing tag — a lost orchestrator raises the emergency
        // surface and fails the test loudly
        await ensureOrchestratorOn(PROBE_TAG);
        await resetTestTag(PROBE_TAG);
    }, 30_000);
    afterAll(async () => {
        // full restoration ONCE: unminimize the orchestrator, view
        // back to the starting tag, the testing tag merged away
        // (its clients — the orchestrator included — land there)
        const wid = (await attrValue<string>("clients.focus.winid")) ?? "";
        if (wid !== "") await setAttr(`clients.${wid}.minimized`, false);
        await hc("use", startTag);
        await new Promise((r) => setTimeout(r, 150));
        await hc("merge_tag", PROBE_TAG, startTag);
    }, 30_000);

    /** STATE-CHANGE GUARD: the view drifts off the probe tag when
     *  the orchestrator is minimized (a WM hook may follow the
     *  emptied view) — every layout-mutating call (split, …) MUST
     *  re-verify and re-focus the probe tag first, or it mutates the
     *  USER'S TAG. Verifies, repairs, and re-verifies. */
    const ensureProbe = async (): Promise<void> => {
        let view = await attrValue<string>("tags.focus.name");
        if (view !== PROBE_TAG) {
            await hc("use", PROBE_TAG);
            await new Promise((r) => setTimeout(r, 150));
            view = await attrValue<string>("tags.focus.name");
        }
        expect(view, `view is ${view}, refusing to mutate`).toBe(PROBE_TAG);
    };

    test("single frame: the rect is frame-bounded, half width, centered", async () => {
        const frame = await frameGeom();
        const rule = await fullHeightRule();
        const geoLine = rule.find((r) => r.startsWith("floating_geometry="));
        expect(geoLine).toBeDefined();
        const geo = parseGeom(geoLine?.split("=")[1] ?? "");
        expect(geo).not.toBeNull();
        const g = geo as Rect;
        // half the frame's width, centered horizontally
        expect(g.w).toBe(Math.floor(frame.w / 2) - (await attrValue<number>("theme.floating.border_width") ?? 0));
        const cx = g.x + g.w / 2;
        expect(Math.abs(cx - (frame.x + frame.w / 2))).toBeLessThanOrEqual(1);
        // the SIZE leaves deco room inside the frame
        const pad = ((await attrValue<number>("theme.floating.title_height")) ?? 0)
            + 2 * ((await attrValue<number>("theme.floating.border_width")) ?? 0);
        expect(g.h).toBe(frame.h - pad);
    }, 30_000);

    test("single frame: the TERMINAL lands exactly on the target (the corrector pins the arrival clamp)", async () => {
        // END-TO-END via the real machine: the RULE gets nudged by
        // hlwm's arrival clamp (+y, no shrink — the too-tall
        // regression), the post-attach corrector pins the window to
        // the exact target. Measure the terminal, not a rule proxy.
        const target = await fullHeightTarget();
        expect(target).not.toBeNull();
        const frame = await frameGeom();
        const pid = await launchTerminal({
            command: "true", // exit instantly; the wrapper parks
            floating: true,
            fullHeight: true,
        });
        expect(pid).not.toBeNull();
        try {
            // wait for the corrector to fire (the client attaches,
            // then is pinned) — poll until the geometry EQUALS the
            // target or the budget runs out
            let final: Rect | null = null;
            for (let i = 0; i < 20; i += 1) {
                await new Promise((r) => setTimeout(r, 300));
                let wid = "";
                for (const w of await listClients()) {
                    if ((await attrValue<number>(`clients.${w}.pid`)) === pid) {
                        wid = w; break;
                    }
                }
                if (wid === "") continue;
                const fg = await attrValue<string>(`clients.${wid}.floating_geometry`);
                if (fg === target) { final = parseGeom(fg); break; }
                final = parseGeom(fg);
            }
            expect(final).toEqual(parseGeom(target));
            // the outer frame inside the frame's content rect
            const title = (await attrValue<number>("theme.floating.title_height")) ?? 0;
            const border = (await attrValue<number>("theme.floating.border_width")) ?? 0;
            const g = final as Rect;
            expect(g.y - title - border).toBeGreaterThanOrEqual(frame.y - 1);
            expect(g.y + g.h + border).toBeLessThanOrEqual(frame.y + frame.h + 1);
        } finally {
            if (pid !== null) { try { process.kill(pid); } catch { /* gone */ } }
        }
    }, 60_000);

    test("above/below split: the rect is bounded by the FOCUSED (half) frame", async () => {
        await ensureProbe();
        await hc("split", "vertical", "0.5");
        await ensureProbe(); // re-verify AFTER the split too

        await new Promise((r) => setTimeout(r, 200));
        const frame = await frameGeom();
        // the probe MUST be a half-height frame — the root-anchor
        // regression (window sized on the whole tag) shows here
        expect(frame.h).toBeLessThan(
            parseGeom(await attrValue<string>("tags.focus.tiling.root.content_geometry"))
                ?.h ?? 0,
        );
        const rule = await fullHeightRule();
        const geo = parseGeom(
            (rule.find((r) => r.startsWith("floating_geometry=")) ?? "").split("=")[1],
        );
        expect(geo).not.toBeNull();
        const g = geo as Rect;
        // horizontal: inside the frame, centered
        expect(g.w).toBe(Math.floor(frame.w / 2) - (await attrValue<number>("theme.floating.border_width") ?? 0));
        expect(g.x).toBeGreaterThanOrEqual(frame.x);
        expect(g.x + g.w).toBeLessThanOrEqual(frame.x + frame.w);
        // vertical: inside the half frame — never the full tag
        expect(g.y).toBeGreaterThanOrEqual(frame.y);
        expect(g.y + g.h).toBeLessThanOrEqual(frame.y + frame.h);
        expect(g.h).toBeLessThan(frame.h); // deco room
    }, 30_000);

    test("above/below split: the TERMINAL's OUTER frame stays inside the half frame", async () => {
        await ensureProbe();
        await hc("split", "vertical", "0.5");
        await ensureProbe(); // re-verify AFTER the split too

        await new Promise((r) => setTimeout(r, 200));
        const frame = await frameGeom();
        const title = (await attrValue<number>("theme.floating.title_height")) ?? 0;
        const border = (await attrValue<number>("theme.floating.border_width")) ?? 0;
        const target = await fullHeightTarget();
        expect(target).not.toBeNull();
        const pid = await launchTerminal({
            command: "true",
            floating: true,
            fullHeight: true,
        });
        expect(pid).not.toBeNull();
        try {
            let final: Rect | null = null;
            for (let i = 0; i < 20; i += 1) {
                await new Promise((r) => setTimeout(r, 300));
                let wid = "";
                for (const w of await listClients()) {
                    if ((await attrValue<number>(`clients.${w}.pid`)) === pid) {
                        wid = w; break;
                    }
                }
                if (wid === "") continue;
                const fg = await attrValue<string>(`clients.${wid}.floating_geometry`);
                if (fg === target) { final = parseGeom(fg); break; }
                final = parseGeom(fg);
            }
            expect(final).toEqual(parseGeom(target));
            const g = final as Rect;
            // the outer frame (content + title bar + borders) stays
            // inside the HALF frame — the split regression, measured
            expect(g.y - title - border).toBeGreaterThanOrEqual(frame.y - 1);
            expect(g.y + g.h + border).toBeLessThanOrEqual(frame.y + frame.h + 1);
        } finally {
            if (pid !== null) { try { process.kill(pid); } catch { /* gone */ } }
        }
    }, 60_000);
});
