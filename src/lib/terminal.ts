// src/lib/terminal.ts — the single-shot terminal spawner (the
// launch_alacritty script, migrated into herbctl as `herbctl
// terminal`; open and run hang off the same machine).
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
//
// The switches install a `rule once` before the spawn, scoped by a
// class pattern derived from $TERMINAL (a criterion-free once-rule
// floats the next attach of ANY class — the reported
// hc_command-splits-a-float bug). Spawned through plain `herbstclient
// spawn` (detached, WM-managed) — NOT through `hc spawn` rules
// machinery: that is for graphical apps.
import { existsSync, statSync } from "node:fs";
import { hc, setAttr } from "./hc.js";
import { spawnEnv } from "./rofi.js";

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
    /** attach on this tagspace (an hlwm tag; created when missing). */
    tag?: string | null;
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
 * pid (the caller may close the terminal later — the run palette
 * closes its pager help-terminals when the rofi session ends), or
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

    const before = opts.urgent ? await clientIds() : new Set<string>();
    await hc("lock");
    let pid: number | null = null;
    try {
        if (rule.length > 0) {
            await hc("rule", "once", `class~${classPattern(terminal)}`, ...rule);
        }
        // Spawned DIRECTLY (detached) rather than via `herbstclient
        // spawn`: the caller gets the child pid back, which the run
        // palette uses to CLOSE its pager help-terminals when the rofi
        // session ends. The once-rule still applies — it fires on the
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
    return pid;
}
