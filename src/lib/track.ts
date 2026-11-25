// src/lib/track.ts — `herbctl track` — the orchestrator observation
// surface. ONE blocking verb, THREE modes:
//
//   herbctl track              the tracker (bare): stores the
//                              monitored window id IN MEMORY, reacts
//                              to its focus change by DISPLAYING /
//                              HIDING the notification (the point:
//                              re-establish the already-validated,
//                              known-good opencode terminal window),
//                              reports every state change on stdout.
//   herbctl track --quiet      REPORT ONLY (the plugin consumer):
//                              stdout events, no notifications.
//   herbctl track --sentry WID the REOPEN WRAPPER (spawned detached
//                              by the plugin at the agent's turn end
//                              — it lives OUTSIDE opencode's
//                              process): event-driven watch of the
//                              wid; on death it displays the
//                              PERSISTENT warning notification
//                              (reopen the session; the click
//                              respawns once via `herbctl terminal`
//                              in the OPENCODE-reported directory)
//                              and terminates; on healthy return it
//                              exits cleanly.
//
// AUTO-CLEANUP (no filesystem state anywhere — the process tree IS
// the state):
//   - the END OF THE AGENT'S TURN cancels the blocking spawn: the
//     tracker watches its own STDIN — the plugin WRITES one
//     character (the explicit exit message); a plugin death (pipe
//     closed) delivers EOF — both exit the tracker.
//   - PERMANENT LOSS (death) → the persistent warning notification,
//     then terminate.
//   - SIGINT → same as the stdin exit signal.

import { attrValue, hc } from "./hc.js";
import { fullHeightTarget, launchTerminal } from "./terminal.js";

export type TrackState = "healthy" | "drop" | "death" | "separation" | "minimized";

export interface TrackEvent {
    state: TrackState;
    wid: string;
    ts: number;
}

/** The session's project directory — from OPENCODE's API (the server
 *  is the source of truth for WHERE; never a recorded cwd). */
let cachedDir: string | null = null;
export async function sessionDir(): Promise<string> {
    if (cachedDir !== null) return cachedDir;
    cachedDir = "";
    // the plugin-injected fact: the opencode plugin spawns the
    // pipeline with the session's directory in the environment
    // (the server env lacks OPENCODE_SESSION_ID — the API route
    // below is unavailable from the sentry process)
    const injected = process.env.OPENCODE_PROJECT_DIR ?? "";
    if (injected !== "") {
        cachedDir = injected;
        return cachedDir;
    }
    const sid = process.env.OPENCODE_SESSION_ID ?? "";
    if (sid === "") return cachedDir;
    try {
        const q = (args: string[]): unknown[] => {
            const proc = Bun.spawnSync(["opencode", "api", ...args],
                { stdout: "pipe", stderr: "ignore" });
            return JSON.parse(proc.stdout.toString()).data ?? [];
        };
        const session = q(["session.list"])
            .find((s: { id: string }) => s.id === sid);
        if (!session) return cachedDir;
        const project = q(["project.list"])
            .find((p: { id: string }) => p.id === session.projectID);
        cachedDir = project?.canonical ?? "";
    } catch {
        cachedDir = "";
    }
    return cachedDir;
}

/** The classification of the monitored wid (the taxonomy; drop is
 *  same-tag only). */
export async function classifyWid(wid: string): Promise<TrackState> {
    if (wid === "" || (await hc("attr", `clients.${wid}.winid`)) === null) {
        return "death";
    }
    const min = await attrValue<boolean | string>(`clients.${wid}.minimized`);
    // parseAttr (herbstutil) returns NATIVE booleans for bool attrs —
    // "true" (string) never matches (the minimized→drop misdetection)
    if (min === true || min === "true") return "minimized";
    const on = await attrValue<string>(`clients.${wid}.tag`);
    const view = await attrValue<string>("tags.focus.name");
    if (on !== view) return "separation";
    const focused = (await attrValue<string>("clients.focus.winid")) === wid;
    return focused ? "healthy" : "drop";
}

// ── the close verb's orchestrator guard (title-derived, no state) ──

function titleMatchesSession(sTitle: string, winTitle: string): boolean {
    if (winTitle.includes(sTitle)) return true;
    const stripped = winTitle
        .replace(/^OC \| /, "")
        .replace(/…/g, "")
        .trim();
    return stripped !== "" && sTitle.startsWith(stripped);
}

let cachedTitle: string | null = null;
async function sessionTitle(): Promise<string> {
    if (cachedTitle !== null) return cachedTitle;
    const sid = process.env.OPENCODE_SESSION_ID ?? "";
    cachedTitle = "";
    if (sid === "") return cachedTitle;
    try {
        const proc = Bun.spawnSync(["opencode", "api", "session.list"],
            { stdout: "pipe", stderr: "ignore" });
        const sessions = JSON.parse(proc.stdout.toString()).data ?? [];
        cachedTitle = sessions.find((s: { id: string }) => s.id === sid)
            ?.title ?? "";
    } catch {
        cachedTitle = "";
    }
    return cachedTitle;
}

/** True when the given wid IS the orchestrator (the driving
 *  session's TUI window). ""-wid / no session → false. */
export async function isOrchestrator(wid: string): Promise<boolean> {
    if (wid === "") return false;
    const title = await sessionTitle();
    if (title === "") return false;
    const t = (await attrValue<string>(`clients.${wid}.title`)) ?? "";
    return titleMatchesSession(title, t);
}

/** The close verb's refusal helper: throws when the orchestrator
 *  holds focus or is the target. */
export async function orchestratorGuard(target?: string): Promise<void> {
    const focused = (await attrValue<string>("clients.focus.winid")) ?? "";
    if (await isOrchestrator(focused)) {
        throw new Error(
            "close: the ORCHESTRATOR holds focus — refusing "
            + "(focus the target first)",
        );
    }
    if (target !== undefined && await isOrchestrator(target)) {
        throw new Error("close: the TARGET is the orchestrator — refusing");
    }
}

/** Bring a window onto a tag and focus it there (THIS hlwm's
 *  `jumpto` FOLLOWS the window): ONE chained spawn under lock —
 *  focus → `move <tag>` → `use <tag>` atomically, the view never
 *  resting on an intermediate state (the user is never stranded
 *  without the orchestrator between the steps). */
export async function bringToTag(wid: string, tag: string): Promise<void> {
    await hc(
        "chain", ",", "lock",
        ",", "jumpto", wid,
        ",", "move", tag,
        ",", "use", tag,
        ",", "unlock",
    );
}

/** The per-state recovery for the notification's click (bare mode
 *  and the sentry): drop → jumpto back; separation → bring back
 *  onto the viewed tag; death → respawn the session ONCE via
 *  `herbctl terminal` in the OPENCODE-reported directory. One
 *  click, one recovery — a process, not a persisted guard. */
export async function recover(state: TrackState, wid: string): Promise<void> {
    if (state === "minimized") {
        // MINIMIZED: un-minimize + focus (jumpto un-minimizes)
        await hc("jumpto", wid);
        return;
    }
    if (state === "drop") {
        await hc("jumpto", wid);
        return;
    }
    if (state === "separation") {
        const view = (await attrValue<string>("tags.focus.name")) ?? "";
        await hc("jumpto", wid);
        if (view !== "") await bringToTag(wid, view);
        return;
    }
    if (state === "death") {
        const dir = await sessionDir();
        await launchTerminal({
            command: "opencode",
            directory: dir !== "" ? dir : null,
            floating: true,
            fullHeight: true,
        });
    }
}

/** The orchestrator window's title for the notification body — the
 *  LIVE WM title (what the bar and alt-tab show: "OC | <subject>"),
 *  falling back to the session's title, then the bare wid — so the
 *  notification says WHICH session prompts the re-focus before the
 *  click (parallel sessions' notifications are otherwise
 *  indistinguishable). */
async function windowTitle(wid: string): Promise<string> {
    const t = (await attrValue<string>(`clients.${wid}.title`)) ?? "";
    if (t !== "") return t;
    const s = await sessionTitle();
    return s !== "" ? s : wid;
}

/** The notification surface (bare + sentry modes): open on loss
 *  (per-state action label), close on healthy. One notification at
 *  a time — the handle lives in memory; a repeated loss replaces
 *  (dunstify -r). */
export class Notifier {
    private id: string;
    private proc: Bun.Subprocess<"ignore", "pipe", "ignore"> | null = null;
    constructor() {
        const sid = process.env.OPENCODE_SESSION_ID ?? "adhoc";
        let h = 0;
        for (let i = 0; i < sid.length; i += 1) {
            h = (h * 31 + sid.charCodeAt(i)) >>> 0;
        }
        // Two in-flight sessions must NEVER share the replace id (the
        // parallel-notifications bug): the session hash gets a WIDE
        // slot space (per-session ids stay STABLE across tracker
        // restarts — the hash is deterministic), and the no-session
        // "adhoc" case is keyed by the PROCESS (those restarts lose
        // cross-turn replacement — acceptable: adhoc has no session
        // identity to be stable against).
        this.id = sid === "adhoc"
            ? String(47200 + (Bun.pid % 999_000))
            : String(47200 + (h % 999_000));
    }
    async open(state: TrackState, wid: string): Promise<void> {
        await this.close();
        const labels: Record<string, string> = {
            drop: "focus",
            minimized: "restore",
            separation: "recover",
        };
        const summaries: Record<string, string> = {
            drop: "drop — focus elsewhere (action: jumpto back)",
            minimized: "minimized (action: restore to focus)",
            separation: "separation — not on the focused tag (action: interrupt + bring)",
        };
        const act = labels[state] ?? "focus";
        // the URGENCY is the state's style:
        //   drop        REGULAR (normal urgency — the config's timeout
        //               applies, it self-expires)
        //   minimized   PERSISTENT YELLOW (normal urgency — the regular
        //               style — no timeout: the track-persistent rule)
        //   separation  WARNING RED (critical urgency, no timeout)
        const flags: string[] = ["-a", "herbctl-track", "-r", this.id];
        if (state === "separation") flags.push("-u", "critical");
        if (state !== "drop") flags.push("-t", "0", "-c", "track-persistent");
        flags.push("-A", `${act},${act}`, "track: orchestrator lost",
            `${summaries[state] ?? state} — "${await windowTitle(wid)}"`);
        this.proc = Bun.spawn(
            ["dunstify", ...flags],
            { stdout: "pipe", stderr: "ignore" },
        );
        void (async () => {
            const out = await new Response(this.proc?.stdout).text();
            if (out.trim() === act) await recover(state, wid);
        })();
    }
    async close(): Promise<void> {
        if (this.proc === null) return;
        Bun.spawnSync(["dunstctl", "close", this.id],
            { stdout: "ignore", stderr: "ignore" });
        try { this.proc.kill(); } catch { /* gone */ }
        this.proc = null;
    }
    /** The DEATH surface: a PERSISTENT warning — it stays until
     *  actioned; the click respawns the session once. */
    async relaunch(wid: string): Promise<void> {
        void this.close();
        const proc = Bun.spawn(
            ["dunstify", "-a", "herbctl-track", "-t", "0", "-u", "critical",
             "-r", this.id,
             "-A", "relaunch,relaunch", "track: orchestrator died",
             `the tracked window is closed — action: relaunch the session`
             + ` — "${await windowTitle(wid)}"`],
            { stdout: "pipe", stderr: "ignore" },
        );
        void (async () => {
            const out = await new Response(proc.stdout).text();
            if (out.trim() === "relaunch") await recover("death", wid);
        })();
    }
}

/** Read the tracker's own STDIN until the EXIT SIGNAL — the
 *  end-of-turn cancel: the plugin WRITES a single character to the
 *  pipe (an explicit, reliable exit message), and closing the pipe
 *  (the plugin dying) delivers EOF — both are the same signal. ONE
 *  reader per process (a second reader on the same stream errors).
 *  ANY byte on stdin is the exit, not just EOF: a write survives
 *  every handle-duplication situation where a close does not. */
async function untilStdinExit(): Promise<void> {
    try {
        const reader = Bun.stdin.stream().getReader();
        for (;;) {
            const { done } = await reader.read();
            if (done) return; // EOF — the plugin is gone
            return;           // a byte — the plugin said exit
        }
    } catch {
        return; // no stdin / closed — treated as exit
    }
}

/** THE TRACK LOOP — blocking. Captures nothing (the wid is given);
 *  reports every state change; bare mode owns the notification
 *  lifecycle; dies on stdin EOF (the turn-end cancel), death (after
 *  the persistent relaunch notification), or SIGINT. */
export async function trackUntil(
    wid: string,
    opts: { quiet?: boolean; notify?: Notifier | null } = {},
): Promise<TrackState> {
    const notifier = opts.notify ?? null;
    const emit = (state: TrackState): void => {
        console.log(JSON.stringify({
            state, wid, ts: Date.now(),
        } satisfies TrackEvent));
    };
    let last = await classifyWid(wid);
    emit(last);
    if (last !== "healthy" && notifier) await notifier.open(last, wid);
    if (last === "death") return last;
    const proc = Bun.spawn(["herbstclient", "-i"], {
        stdout: "pipe", stderr: "ignore",
    });
    const reader = proc.stdout.getReader();
    // CATCH-UP: the binary's startup latency means a focus change
    // between the capture and the -i ATTACH would otherwise be
    // missed forever (the event fired before the listener existed).
    // Re-classify once the stream is up.
    last = await classifyWid(wid);
    emit(last);
    if (last !== "healthy" && notifier) await notifier.open(last, wid);
    if (last === "death") return last;
    const stdinExit = untilStdinExit(); // ONE reader for the process
    const td = new TextDecoder();
    let buf = "";
    for (;;) {
        const chunk = await Promise.race([
            reader.read().then(
                (r) => r, () => ({ done: true, value: undefined }),
            ),
            stdinExit.then(() => ({ done: true, value: undefined })),
        ]);
        if (chunk.done) break; // stream end OR the turn-end cancel
        buf += td.decode(chunk.value);
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
            buf = buf.slice(nl + 1);
            const state = await classifyWid(wid);
            if (state === last) continue;
            last = state;
            emit(state);
            if (notifier) {
                if (state === "healthy") await notifier.close();
                else await notifier.open(state, wid);
            }
            if (state === "death") return last;
        }
    }
    try { proc.kill(); } catch { /* gone */ }
    return last;
}

/** `herbctl track` — the verb body: the TRACKER (the turn-scoped
 *  observer). The wid is the calling terminal's window — the focused
 *  client at spawn (authoritative exactly there). Reports every
 *  state change; bare mode owns the notification lifecycle (the
 *  sentry is the composed owner otherwise). */
export async function track(
    opts: { quiet?: boolean; sentry?: string } = {},
): Promise<void> {
    // SENTRY mode: the notification OWNER (composed over a tracker's
    // stream — consume the events from stdin; degrade to the
    // independent watch when the stream ends)
    if (opts.sentry !== undefined) {
        await sentryBody(opts.sentry);
        return;
    }
    const wid = (await attrValue<string>("clients.focus.winid")) ?? "";
    if (wid === "") throw new Error("track: no focused client to track");
    await trackUntil(wid, {
        quiet: opts.quiet,
        notify: opts.quiet ? null : new Notifier(),
    });
}

/** `herbctl sentry <wid>` — the NOTIFICATION OWNER, in terms of
 *  `herbctl track`: CONSUMES the tracker's event stream on stdin
 *  (one observation point — no duplicated -i loop) and drives the
 *  notification surface: drop/separation open it (per-state
 *  action), healthy closes it, DEATH → the PERSISTENT reopen
 *  notification + terminate. On stdin EOF (the tracker cancelled
 *  at the turn end, or opencode exited) it DEGRADES to its own
 *  event-driven classification loop and keeps watching — the
 *  lifetime that covers the risk window (it lives outside
 *  opencode's process when spawned detached). */
async function sentryBody(wid: string): Promise<void> {
    const notifier = new Notifier();
    let last = "healthy";
    // phase 1: consume the upstream stream while it flows
    if (!process.stdin.isTTY) {
        const reader = Bun.stdin.stream().getReader();
        const td = new TextDecoder();
        let buf = "";
        for (;;) {
            const chunk = await reader.read().then(
                (r) => r, () => ({ done: true, value: undefined }),
            );
            if (chunk.done) break;
            buf += td.decode(chunk.value);
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
                const line = buf.slice(0, nl);
                buf = buf.slice(nl + 1);
                try {
                    const ev = JSON.parse(line) as {
                        state?: TrackState; wid?: string;
                    };
                    if (!ev.state || ev.wid !== wid) continue;
                    last = ev.state;
                    if (last === "healthy") {
                        await notifier.close();
                    } else if (last === "death") {
                        await notifier.relaunch(wid);
                        return;
                    } else {
                        await notifier.open(last, wid);
                    }
                } catch {
                    // malformed line — skip
                }
            }
        }
    }
    // phase 2: the upstream ended — the INDEPENDENT continuation
    // (the lifetime that covers the risk window)
    for (;;) {
        const state = await waitHealthy(wid, 300_000);
        if (state === "healthy") {
            await notifier.close();
            return; // back — clean exit
        }
        if (state === "death") {
            await notifier.relaunch(wid);
            return;
        }
        // drop/separation at the cap: surface, keep watching
        if (last !== state) {
            await notifier.open(state, wid);
            last = state;
        }
    }
}

/** TEST/CONSUMER SUPPORT: wait until the wid classifies healthy —
 *  event-driven (the -i stream), with a cap (a timeout, not a
 *  poll). The probe-test gate. */
export async function waitHealthy(
    wid: string,
    capMs = 300_000,
): Promise<TrackState> {
    const deadline = Date.now() + capMs;
    let state = await classifyWid(wid);
    if (state === "healthy") return state;
    const proc = Bun.spawn(["herbstclient", "-i"], {
        stdout: "pipe", stderr: "ignore",
    });
    const reader = proc.stdout.getReader();
    const td = new TextDecoder();
    let buf = "";
    try {
        for (;;) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) return await classifyWid(wid);
            const timer = setTimeout(() => proc.kill(), remaining);
            const chunk = await reader.read().then(
                (r) => r, () => ({ done: true, value: undefined }),
            );
            clearTimeout(timer);
            if (chunk.done) return await classifyWid(wid);
            buf += td.decode(chunk.value);
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
                buf = buf.slice(nl + 1);
                state = await classifyWid(wid);
                if (state === "healthy") return state;
            }
        }
    } finally {
        try { proc.kill(); } catch { /* gone */ }
    }
}
