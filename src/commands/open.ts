// src/commands/open.ts — the rofi directory browser (the `get`/
// spawn-directory workflow, made interactive):
//
//   herbctl open [dir] [--no-hidden]
//
// A rofi menu lists ".." and "." first, then the subdirectories and
// files of the browsed directory — HIDDEN ENTRIES INCLUDED BY
// DEFAULT (dot dirs are the browser's main attractor; --no-hidden
// excludes them). The convention:
//
//   Return on a directory  -> DESCEND (re-open the menu inside it)
//   Return on "."          -> open a terminal in the browsed directory
//   Return on a file       -> open it in $EDITOR in a floated
//                             temporary terminal
//   Shift-Return on a dir  -> launch a terminal inside it, done
//   Shift-Return on a file -> open it in $EDITOR, done
//   Escape                 -> cancel, nothing happens
//
// The browser loops until a terminal or a view is opened, or the user
// escapes — exactly the "rapidly launch a terminal inside a directory
// or view a file" flow.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { realpathSync, statSync } from "node:fs";
import { rofiMenu, runInTerminal } from "../lib/rofi.js";

/** Shell-quote a path for the wrapper's command string. */
function quote(path: string): string {
    return `'${path.replaceAll("'", "'\\''")}'`;
}

/** View a file: $EDITOR by default, no got/viewer special-casing —
 *  every selected entry (including links and odd paths) is opened in
 *  the editor, which owns the handling. */
function viewFile(path: string): void {
    const editor = process.env.EDITOR || "vi";
    runInTerminal(`${editor} ${quote(path)}`);
}

/** Open a floating terminal rooted at `dir` (the terminal machine). */
async function terminalIn(dir: string): Promise<void> {
    const { launchTerminal } = await import("../lib/terminal.js");
    await launchTerminal({ directory: dir, floating: true });
}

interface Pick {
    rc: number;
    name: string;
}

/** One menu over `dir`'s contents; null on cancel/unreadable dir. */
async function browse(
    dir: string,
    noHidden: boolean,
): Promise<Pick | null> {
    const dirs: string[] = [];
    const files: string[] = [];
    let scan: string[];
    try {
        // onlyFiles:false is REQUIRED: scanSync defaults to files-only,
        // which silently dropped every subdirectory from the menu.
        scan = Array.from(
            new Bun.Glob("*").scanSync({ cwd: dir, dot: !noHidden, onlyFiles: false }),
        );
    } catch {
        return null; // unreadable directory — fail soft, cancel
    }
    for (const name of scan) {
        try {
            (statSync(`${dir}/${name}`).isDirectory() ? dirs : files)
                .push(name);
        } catch {
            continue; // vanished mid-scan
        }
    }
    dirs.sort((a, b) => a.localeCompare(b));
    files.sort((a, b) => a.localeCompare(b));
    const { rc, selection } = await rofiMenu({
        prompt: `open ${dir}`,
        entries: ["..", ".", ...dirs, ...files],
    });
    return selection === "" ? null : { rc, name: selection };
}

export default defineCommand({
    name: "open" as never,
    description: "rofi directory browser: terminal in a dir, $EDITOR a file",
    options: {
        "no-hidden": option(z.boolean().default(false), {
            description: "exclude hidden entries (shown by default)", short: "n",
            // bunli only treats an option as a boolean FLAG when this is
            // set: without it a bare flag parses as undefined (→ default
            // false) and a flag followed by a positional swallows the
            // positional as its value.
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags, positional }) => {
        let dir: string;
        try {
            dir = realpathSync(positional[0] ?? process.cwd());
        } catch {
            throw new Error(`open: no such directory: ${positional[0]}`);
        }
        while (true) {
            const pick = await browse(dir, flags["no-hidden"]);
            if (pick === null) return; // Escape: nothing happens
            const target = pick.name === "."
                ? dir
                : pick.name === ".."
                    ? `${dir}/..`
                    : `${dir}/${pick.name}`;
            let isDir = pick.name === "." || pick.name === "..";
            if (!isDir) {
                try {
                    isDir = statSync(target).isDirectory();
                } catch {
                    continue; // vanished mid-menu: re-open where we were
                }
            }
            if (!isDir) {
                viewFile(target); // Shift-Return or Return on a file: view
                return;
            }
            let absolute: string;
            try {
                absolute = realpathSync(target);
            } catch {
                continue; // vanished mid-menu: re-open where we were
            }
            if (pick.rc === 10 || pick.name === ".") {
                await terminalIn(absolute); // Shift-Return on a dir / Return on "."
                return;
            }
            dir = absolute; // Return on a directory: descend
        }
    },
});
