// src/lib/terminal.ts — the single-shot terminal spawner (the
// launch_alacritty script, migrated into herbctl as `herbctl
// terminal`; open hang off the same machine).
//
// The command runs under an interactive bash inside the spawned
// terminal, delegated to paused-for-dismiss_idle — when the command
// exits, the wrapper reports the exit status and waits for a SINGLE
// key press ("press any key to close"), then exits — and the terminal
// window closes with it. Nothing lingers; while parked, the WM title
// reads "paused-for-dismiss_idle <program that was run>".
//
//   herbctl terminal [--floating] [--urgent] [--no-distract] \
//       [-d <dir>] "<command>"
//
//   -d <dir>       cd into <dir> first (part of the tool's interface —
//                  the caller never writes a `cd ... &&` prefix). With
//                  no command string, the command is an interactive
//                  login shell (`bash -il`) in that directory.
//                  NEVER `exec bash -l` in the command string: the
//                  wrapper runs `bash -ic "paused-for-dismiss_idle
//                  <cmd>"`, and `exec` replaces the wrapper with a
//                  NON-interactive login bash that exits immediately.
//
//   --floating     the terminal window floats when it attaches —
//                  floating is owned ENTIRELY by the once-rule below;
//                  there is NO post-attach machinery
//   --urgent       the terminal raises the urgent hint (tag marker)
//   --no-distract  the terminal does NOT take focus on attach
//   --bind         bind focus post-attach (herbstclient bring —
//                  overrides the focus=off of --urgent/--tag)
//
// The switches install a `rule once` before the spawn, scoped by a
// class pattern derived from $TERMINAL (a criterion-free once-rule
// floats the next attach of ANY class — the reported
// hc_command-splits-a-float bug). Spawned through plain `herbstclient
// spawn` (detached, WM-managed) — NOT through `hc spawn` rules
// machinery: that is for graphical apps.
import { existsSync, statSync } from "node:fs";
import { attrValue, hc, listClients, setAttr } from "./hc.js";
import { decoMargins } from "./geometry.js";
import { spawnEnv } from "./rofi.js";

/** Parse a hlwm WxH+X+Y geometry string. Null when malformed. */
function parseGeom(
    s: string,
): { w: number; h: number; x: number; y: number } | null {
    const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(s);
    if (!m) return null;
    const [, w, h, x, y] = m.map(Number) as [unknown, number, number, number, number];
    return { w, h, x, y };
}

/**
 * The fullHeight TARGET geometry (pure-ish: live attr reads, no
 * spawn): floating at FULL FOCUSED-FRAME height, half the frame's
 * width, centered on it, as a WxH+X+Y string — null when no usable
 * frame geometry.
 *
 * Anchored to the FOCUSED FRAME (tags.focus.tiling.focused_frame.
 * content_geometry), NOT the tag root: the root spans the whole tag
 * and its rectangle can overrun the bar/panel strips; a frame lives
 * strictly inside them, so the pager always fits and stays out of the
 * user's way.
 *
 * The frame rect is measured INSIDE the window frame: the WM adds the
 * decoration outward (title bar on top, borders around), so the height
 * shrinks by title_height + 2*border_width — without it the bottom
 * edge lands off-screen. The theme values are read LIVE, one leaf attr
 * each (the FLOATING slice decorates this window — the rule floats it
 * — with the global slice as fallback); nothing is hardcoded.
 *
 * floating_geometry is interpreted in ABSOLUTE screen coordinates of
 * the client content (verified live: requested 400x300+600+500 landed
 * at X 600,500 exactly). The RULE consequence is nonetheless nudged
 * by hlwm's arrival placement (a clamp toward the work area that does
 * NOT shrink the height — the too-tall regression); the post-attach
 * CORRECTOR (correctFullHeight) pins the window to this exact target
 * via `set_attr` — verified live: a post-attach set is honored
 * verbatim, never re-clamped.
 */
export async function fullHeightTarget(): Promise<string | null> {
    const [geo, margins] = await Promise.all([
        attrValue<string>(
            "tags.focus.tiling.focused_frame.content_geometry",
        ),
        // The REAL deco stack — theme.floating's padding_*, inner_width,
        // outer_width, title_height + title_depth (verified against the
        // live X frame extents: 7,7,36,7 on this config). The old
        // title + 2*border pad (28 vs the real 43) put the terminal's
        // outer frame 24px past the monitor bottom — the too-tall
        // regression.
        decoMargins(""),
    ]);
    const rect = parseGeom(geo ?? "");
    if (rect === null) return null;
    const [L, T, R, B] = margins;
    // floating_geometry positions the window's CONTENT; the WM draws
    // the decoration OUTWARD from it. The outer frame lands exactly on
    // the frame's content rect: content y = frame.y + T, content h =
    // frame.h - T - B, half the width centered (deco-adjusted).
    const w = Math.max(Math.floor(rect.w / 2) - L - R, 1);
    const h = Math.max(rect.h - T - B, 1);
    const x = rect.x + Math.floor((rect.w - w) / 2);
    const y = rect.y + T;
    return `${w}x${h}+${x}+${y}`;
}

/** The fullHeight RULE (the arrival hint — correctFullHeight pins
 *  the exact target post-attach). */
export async function fullHeightRule(): Promise<string[]> {
    const target = await fullHeightTarget();
    if (target === null) return ["floating=on"];
    return ["floating=on", `floating_geometry=${target}`];
}

export interface TerminalOptions {
    /** The command STRING (bash -ic), or null for a login shell. */
    command?: string | null;
    /** cd here first (a leading ~ is expanded). */
    directory?: string | null;
    /** float the terminal once it attaches (rule-owned). */
    floating?: boolean;
    /** raise the urgent hint post-attach (NOT rule-settable in hlwm). */
    urgent?: boolean;
    /** the terminal does NOT take focus on attach (focus=off rule). */
    noDistract?: boolean;
    /** attach on this tag (an hlwm tag; created when missing). */
    tag?: string | null;
    /** the help-terminal shape: floating at FULL focused-frame
     *  height (half the frame width, centered on it) via the
     *  floating_geometry rule consequence. The pager/help surfaces
     *  read better tall than as a corner window — and the frame
     *  anchor keeps the surface inside the panels. */
    fullHeight?: boolean;
    /** bind the user's focus to the terminal post-attach: a
     *  `herbstclient bring` (focus + raise + move to the viewed tag)
     *  as soon as the client attaches. The deliberate OVERRIDE of
     *  the focus=off that the urgent/tag rules arm — the urgent
     *  marker still surfaces, but attention is bound immediately. */
    bind?: boolean;
}

/** bash printf %q equivalent (single-quote wrapping is argv-safe). */
function shellQuote(s: string): string {
    return `'${s.replaceAll("'", "'\\''")}'`;
}

/** Case-tolerant first char: the binary `alacritty` reports WM_CLASS
 *  `Alacritty` (the repo's [Yy]ad idiom). */
function classPattern(terminal: string): string {
    const base = terminal.split(" ")[0].replace(/.*\//, "");
    const first = base.charAt(0);
    const rest = base.slice(1);
    const upper = first.toUpperCase();
    const lower = first.toLowerCase();
    return `[${upper}${lower}]${rest}`;
}

/** List the client object ids currently attached (0x… hex ids). */
async function clientIds(): Promise<Set<string>> {
    const out = (await hc("attr", "clients."))?.stdout ?? "";
    return new Set(out.match(/0x[0-9a-fA-F]+/g) ?? []);
}

/** Post-attach urgent watcher: poll up to 3 s for the NEW client and
 *  set clients.<winid>.urgent=true (urgent is not rule-settable in
 *  hlwm 0.9.5 — the whole rule command would fail). focus=off on the
 *  same rule means the urgent flag never steals focus. */
function watchUrgent(before: Set<string>): void {
    void (async () => {
        for (let i = 0; i < 30; i += 1) {
            for (const id of await clientIds()) {
                if (!before.has(id)) {
                    await setAttr(`clients.${id}.urgent`, true);
                    return;
                }
            }
            await new Promise((r) => setTimeout(r, 100));
        }
    })();
}

/**
 * Spawn the terminal, detached and rule-scoped. Resolves the child
 * pid (the caller may close the terminal later — palette callers
 * close their tracked pager help-terminals when the rofi session
 * ends), or
 * null on any failure (the dots fail-soft convention — a failed spawn
 * must never wedge the keybind).
 */
export async function launchTerminal(opts: TerminalOptions): Promise<number | null> {
    let dir = opts.directory ?? "";
    if (dir !== "") {
        if (dir.startsWith("~")) dir = `${process.env.HOME}${dir.slice(1)}`;
        try {
            if (!statSync(dir).isDirectory()) throw new Error("not a directory");
        } catch {
            return null; // no such directory — fail soft
        }
    }

    let userCmd: string;
    if (opts.command !== undefined && opts.command !== null && opts.command !== "") {
        userCmd = opts.command;
        if (dir !== "") {
            // The cd is part of the command string, not a separate
            // shell — the park phase reports the exit status of the
            // whole sequence.
            userCmd = `cd ${shellQuote(dir)} && ${userCmd}`;
        }
    } else {
        // No command string: an interactive login shell in <dir> (or
        // the current directory); bash -il stays open until the user
        // exits — the wrapper then parks for one key press.
        userCmd = dir !== ""
            ? `cd ${shellQuote(dir)} && exec bash -il`
            : "exec bash -il";
    }

    const terminal = process.env.TERMINAL || "alacritty";
    const quoted = shellQuote(userCmd);
    const inner = `paused-for-dismiss_idle ${quoted}`;

    // One scoped `rule once` (class-matched via the pattern above)
    // BEFORE the spawn, under lock: the rule and the spawn are atomic
    // with respect to other WM operations, so the once-rule can't fire
    // on an unrelated window that attaches in between.
    const rule: string[] = [];
    if (opts.floating) rule.push("floating=on");
    if (opts.urgent) rule.push("floating=on", "focus=off");
    if (opts.noDistract) rule.push("focus=off");
    if (opts.tag) rule.push(`tag=${opts.tag}`, "focus=off", "switchtag=off");
    if (opts.fullHeight) {
        rule.push(...(await fullHeightRule()));
    }

    const before = opts.urgent ? await clientIds() : new Set<string>();
    await hc("lock");
    let pid: number | null = null;
    try {
        if (rule.length > 0) {
            await hc("rule", "once", `class~${classPattern(terminal)}`, ...rule);
        }
        // Spawned DIRECTLY (detached) rather than via `herbstclient
        // spawn`: the caller gets the child pid back, which palette
        // callers use to CLOSE their pager help-terminals when the
        // rofi session ends. The once-rule still applies — it fires on the
        // window attach, not on who exec'd it.
        const child = Bun.spawn([terminal, "-e", "bash", "-ic", inner], {
            detached: true,
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
            env: spawnEnv(),
        });
        child.unref();
        pid = child.pid;
    } finally {
        await hc("unlock");
    }
    if (opts.urgent) watchUrgent(before);
    if (opts.bind && pid !== null) void bindOnAttach(pid);
    if (opts.fullHeight && pid !== null) {
        // the CORRECTOR: hlwm's arrival placement nudges the ruled
        // geometry (a clamp toward the work area that does not
        // shrink the height — the too-tall regression), but a
        // POST-ATTACH `set_attr` is honored verbatim (verified
        // live). Fire-and-forget: wait for the terminal client to
        // attach (matched by the spawned child's pid — hlwm exposes
        // it), then pin its floating_geometry to the exact target.
        void correctFullHeight(pid);
    }
    return pid;
}

/** Fire-and-forget post-attach BIND: poll briefly for the client
 *  whose pid is the spawned terminal's, then `herbstclient bring` it
 *  (focus + raise + move to the viewed tag) — the pid match is the
 *  precise shape (correctFullHeight's), immune to unrelated attaches
 *  during the window. Fail-soft: a miss (window closed before it
 *  attached) leaves focus alone. */
async function bindOnAttach(pid: number): Promise<void> {
    for (let i = 0; i < 30; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        for (const w of await listClients()) {
            if ((await attrValue<number>(`clients.${w}.pid`)) === pid) {
                await hc("bring", w);
                return;
            }
        }
    }
}

/** Fire-and-forget post-attach correction: poll briefly for the
 *  client whose pid is the spawned terminal's, then pin its
 *  floating_geometry to the recomputed fullHeight target (the frame
 *  may have changed while the terminal started — recompute, don't
 *  reuse the rule's string). Fail-soft everywhere: a miss leaves
 *  hlwm's arrival placement. */
async function correctFullHeight(pid: number): Promise<void> {
    for (let i = 0; i < 30; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        for (const w of await listClients()) {
            if ((await attrValue<number>(`clients.${w}.pid`)) === pid) {
                const target = await fullHeightTarget();
                if (target !== null) {
                    await setAttr(`clients.${w}.floating_geometry`, target);
                }
                return;
            }
        }
    }
}
