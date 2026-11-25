// src/lib/probe.ts — the LIVE-TEST support layer (the orchestrator-
// aware probe-tag machinery used by tests/live.test.ts). NO
// FILESYSTEM STATE: the contract is the process tree — the track
// daemon (lib/track.ts) owns observation, the probe owns setup.
//
//   ensureTestTag(tag)   bring the orchestrator onto the probe tag
//                        and FLOAT it over the experiment (no tiling
//                        slot — no layout jitter; clicking it takes
//                        the float layer — the user's pause).
//   resetTestTag(tag)    per-test reset: the view ON the tag, splits
//                        collapsed, the orchestrator re-floated. No
//                        client is closed here (tests own their probe
//                        windows — they kill them by class).
//   ensureOrchestratorOn(tag)  the proceed gate: WAIT for healthy —
//                        event-driven (waitHealthy), a pause holds
//                        it; a lost cap surfaces the emergency.

import { attrValue, hc, setAttr } from "./hc.js";
import { fullHeightTarget, launchTerminal } from "./terminal.js";
import { waitHealthy, type TrackState } from "./track.js";
import { spawnDetached } from "./rule-spawn.js";

/** Bring a window onto a tag and focus it there. ONE chained spawn
 *  under lock — focus → `move <tag>` → `use <tag>` atomically: the
 *  view never rests on an intermediate state, so the user is never
 *  stranded without the orchestrator between the steps. (THIS hlwm's
 *  `jumpto` FOLLOWS the window: it never carries the window over.) */
export async function bringToTag(wid: string, tag: string): Promise<void> {
    await hc(
        "chain", ",", "lock",
        ",", "jumpto", wid,
        ",", "move", tag,
        ",", "use", tag,
        ",", "unlock",
    );
}

/** Float the orchestrator OVER the experiment: floating layer, no
 *  tiling slot — the probe frames' geometry never depends on it
 *  (no jitter), and clicking it takes the FLOAT LAYER (focus leaves
 *  the tiling entirely) — the user's pause affordance. The floating
 *  shape is the fullHeight pager target (big enough to monitor
 *  from, anchored to the focused frame, inside the panels). */
async function floatOrchestrator(wid: string): Promise<void> {
    await setAttr(`clients.${wid}.minimized`, false);
    await setAttr(`clients.${wid}.floating`, true);
    const target = await fullHeightTarget();
    if (target !== null) {
        await setAttr(`clients.${wid}.floating_geometry`, target);
    }
    await hc("jumpto", wid);
}

/**
 * ENSURE a testing tag: create it when missing (the add fails
 * softly when it exists) and return the run context — the testing
 * tag, the tag the session started on, and the orchestrator wid.
 * The orchestrator is BROUGHT onto the testing tag and FLOATS over
 * the experiment. Resolves the wid BEFORE the tag switch: `use`
 * moves focus off the TUI (an empty tag has no focused client), so
 * a capture AFTER it gets nothing.
 */
export async function ensureTestTag(
    tag = "herbctl-orchestrate",
): Promise<{ tag: string; startTag: string; wid: string }> {
    const startTag = (await attrValue<string>("tags.focus.name")) ?? "work";
    const wid = (await attrValue<string>("clients.focus.winid")) ?? "";
    await hc("add", tag); // fails soft when it exists
    await hc("use", tag);
    if (wid !== "") {
        await bringToTag(wid, tag);
        await floatOrchestrator(wid);
    }
    return { tag, startTag, wid };
}

/**
 * RESET the testing tag to its TESTING state: the view ON the tag,
 * splits collapsed (one frame), the orchestrator unminimized,
 * floating, focused. The orchestrator STAYS on the testing tag —
 * resetting never evicts it. NO client is closed here.
 */
export async function resetTestTag(tag: string): Promise<boolean> {
    await hc("use", tag);
    if ((await attrValue<string>("tags.focus.name")) !== tag) return false;
    for (let i = 0; i < 16; i += 1) {
        const count = await attrValue<number>("tags.focus.frame_count");
        if ((count ?? 1) <= 1) break;
        await hc("remove");
    }
    const wid = (await attrValue<string>("clients.focus.winid")) ?? "";
    return wid === "" ? false : true;
}

/**
 * THE PROCEED GATE: wait for the orchestrator to classify healthy
 * (intact, on the testing tag, visible, focused) — EVENT-DRIVEN
 * (waitHealthy's -i stream), no polling, no filesystem. The cap (a
 * timeout, not a poll) raises the PERMANENT emergency notification
 * and THROWS.
 */
export async function ensureOrchestratorOn(
    tag: string,
    startTag?: string,
): Promise<string> {
    const wid = (await attrValue<string>("clients.focus.winid")) ?? "";
    const state: TrackState = await waitHealthy(wid);
    if (state === "healthy") return wid;
    // the cap: the permanent emergency — respawn-once via `herbctl
    // terminal` in the OPENCODE-reported directory
    const dir = (await import("./track.js")).sessionDir();
    spawnDetached("sh", ["-c",
        `dunstify -a herbctl-track -t 0 -A 'reset,reset'`
        + ` 'track: emergency' 'the gate stayed lost on tag ${tag}';`
        + `herbstclient jumpto ${wid} 2>/dev/null;`
        + `true`,
    ]);
    if (state === "death") {
        await launchTerminal({
            command: "opencode",
            directory: dir !== "" ? dir : null,
            floating: true,
            fullHeight: true,
        });
    }
    throw new Error(
        `orchestrator lost on '${tag}' (state: ${state}) — `
        + "emergency surface raised; the test cannot proceed",
    );
}
