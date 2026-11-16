// src/commands/command.ts — the rofi command palette over the
// hlwm/shell helper scripts (the hc_command script, migrated into
// herbctl; $Mod-c lands here via the two-line hc_command shim).
//
// Every PATH executable whose name starts with one of the PREFIXES
// shows up in a rofi dmenu styled like the app launcher; herbctl is
// PINNED at the top (the WM-controller CLI heads the palette).
//
// Selection handling:
//   Return              run silently: detached, output discarded
//                       (deliberately NOT via `hc spawn` — that
//                       applies window rules and is for graphical apps)
//   Shift-Return        run in a floated temporary terminal
//   Ctrl-Shift-Return   same, with --help appended
//   Tab / Ctrl-Return   Tab-completing a SINGLE command: the
//                       selection is handed to `herbctl run` — the
//                       single-level completion palette over the
//                       command's help (Shift-Return descends a
//                       subcommand, Return accepts)
//   Escape              cancelled, nothing runs
//
// The enumeration is ONE find pass over all PATH dirs (-L: the
// .local/bin entries are symlinks into the dots repo), deduped, with
// $HOME/.local/bin ALWAYS included (the WM spawn env may lack it) and
// the /mnt/* WSL interop dirs SKIPPED (9P-mounted; enumerating them
// stalls find for tens of seconds, and rofi_*/hc_*/hlwm* helpers can
// never live there).
import { defineCommand, option } from "@bunli/core";
import { closeSync, openSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";

import { spawnDetached } from "../lib/rule-spawn.js";
import { rofiMenu, runInTerminal, spawnEnv } from "../lib/rofi.js";
import { runPalette } from "./run.js";

/** Which executable name prefixes are listed. */
const PREFIXES = ["rofi_", "hc_", "hlwm"];

/** One find pass over the PATH dirs; deduped, herbctl pinned. */
function listCommands(): string[] {
    const dirs = new Set<string>([`${process.env.HOME}/.local/bin`]);
    // Split on colon ONLY: entries contain spaces ("Program Files").
    for (const dir of (process.env.PATH ?? "").split(":")) {
        if (dir === "" || dir.startsWith("/mnt/")) continue;
        dirs.add(dir);
    }
    const nameTests = PREFIXES.flatMap((p, i) =>
        i === 0 ? ["-name", `${p}*`] : ["-o", "-name", `${p}*`],
    );
    try {
        const proc = Bun.spawnSync(
            [
                "find", "-L", ...dirs,
                "-maxdepth", "1", "-type", "f", "-executable",
                "(", ...nameTests, ")", "-printf", "%f\n",
            ],
            { env: spawnEnv() },
        );
        const found = proc.stdout.toString().split("\n");
        // herbctl heads the palette when it resolves — fail-soft.
        const pinned = Bun.which("herbctl") ? ["herbctl"] : [];
        return [...pinned, ...new Set(found.filter(Boolean))];
    } catch {
        return Bun.which("herbctl") ? ["herbctl"] : [];
    }
}

/** Single-instance lock (the palette must NEVER stack: key repeat or
 *  a double-press would open two rofi windows). O_EXCL create; a lock
 *  older than 15 s is stale (a killed process) and gets stolen. */
function acquireLock(): { fd: number; release(): void } | null {
    const path = `${tmpdir()}/herbctl-command.lock`;
    try {
        statSync(path);
        try {
            if (Date.now() - statSync(path).mtimeMs < 15_000) return null;
            rmSync(path);
        } catch {
            // vanished between stat and rm — proceed to create
        }
    } catch {
        // no lock file — proceed to create
    }
    try {
        const fd = openSync(path, "wx");
        return {
            fd,
            release() {
                try {
                    rmSync(path);
                } catch {
                    // already gone
                }
                closeSync(fd);
            },
        };
    } catch {
        return null; // held by another palette
    }
}

export default defineCommand({
    name: "command" as never,
    description: "Rofi command palette over the helper scripts (the hc_command)",
    options: {
        extra: option(z.array(z.string()).default([]), {
            description: "extra name prefixes to list (repeatable)", short: "p",
            repeatable: true,
        }),
    },
    handler: async ({ flags }) => {
        const lock = acquireLock();
        if (!lock) return; // a palette is already up
        try {
            await paletteRun([...PREFIXES, ...flags.extra]);
        } finally {
            lock.release();
        }
    },
});

async function paletteRun(prefixes: string[]): Promise<void> {
    while (true) {
        const { rc, selection } = await rofiMenu({
            prompt: "command",
            entries: listCommands(),
        });
        if (selection === "") return; // Escape: nothing runs
        switch (rc) {
            case 12:
            case 13: // Tab / Ctrl-Return: hand the single command to the
                // run palette — herbctl run IS the single-level
                // completion implementation (descend with Shift-Return).
                await runPalette([selection]);
                return;
            case 10: // Shift-Return: run in the floated terminal
                await runInTerminal(selection);
                return;
            case 11: // Ctrl-Shift-Return: same, with --help appended
                await runInTerminal(`${selection} --help`);
                return;
            default: // Return: run silently, detached, output discarded
                spawnDetached("sh", ["-c", selection]);
                return;
        }
    }
}
