// src/commands/terminal.ts — THE terminal verb (the migrated
// launch_alacritty machine, hoisted from `spawn terminal`):
//
//   herbctl terminal [--floating] [--urgent] [--no-distract] \
//       [--full-height] [-t <tag>] [-d <dir>] "<command>"
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
//   -t <tag>  attach on this tag, CREATING it when missing
//                  (`ensureTag` — allocation never switches
//                  focus). Implies focus=off + switchtag=off: the
//                  window lands in the background on <tag>; the
//                  WM title/urgent marker surfaces it. Combine with
//                  --urgent for the tag marker. Purpose: deferred-work
//                  terminals (npm publish sessions, debugging shells)
//                  batch on a NAMED workspace the user visits when
//                  ready.
//
//   --floating     the terminal window floats when it attaches —
//                  floating is owned ENTIRELY by the once-rule below;
//                  there is NO post-attach machinery
//   --urgent       the terminal raises the urgent hint (tag marker)
//   --no-distract  the terminal does NOT take focus on attach
//   --full-height  floating at FULL focused-frame height, centered on
//                  it (the pager/help-terminal shape)
//
// BARE `herbctl terminal` stays the $Mod-Enter launcher: no flags, a
// plain tiled $TERMINAL through the WM — the user-friendly surface.
// The switches install a `rule once` before the spawn, scoped by a
// class pattern derived from $TERMINAL (a criterion-free once-rule
// floats the next attach of ANY class). The full contract is
// lib/terminal.ts.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { ensureTag } from "../lib/allocate.js";
import { hc } from "../lib/hc.js";
import { launchTerminal } from "../lib/terminal.js";

export default defineCommand({
    name: "terminal" as never,
    description: "spawn $TERMINAL (the $Mod-Enter terminal; flags = the machine)",
    options: {
        floating: option(z.boolean().default(false), {
            description: "float the terminal once it attaches (rule-owned)",
            short: "f",
            argumentKind: "flag",
        }),
        urgent: option(z.boolean().default(false), {
            description: "raise the urgent hint post-attach (no focus steal)",
            short: "u",
            argumentKind: "flag",
        }),
        "no-distract": option(z.boolean().default(false), {
            description: "the terminal does NOT take focus on attach",
            short: "n",
            argumentKind: "flag",
        }),
        "full-height": option(z.boolean().default(false), {
            description:
                "terminal: floating at FULL frame height, centered on the focused frame (the help-terminal shape)",
            argumentKind: "flag",
        }),
        tag: option(z.string().optional(), {
            description:
                "attach on this tag, creating it when missing (focus stays; combine with --urgent for the marker)",
            short: "t",
        }),
        directory: option(z.string().optional(), {
            description: "cd into <dir> first (a leading ~ is expanded)",
            short: "d",
        }),
    },
    handler: async ({ flags, positional }) => {
        // BARE invocation (no flags, no command) — the $Mod-Enter
        // shape: a plain tiled $TERMINAL through the WM, closing with
        // its shell, NO rules, NO parking (launchTerminal's login
        // shell runs under paused-for-dismiss_idle — the park is for
        // command terminals, not the keybind).
        const command = positional.join(" ") || null;
        const machine = flags.floating || flags.urgent || flags["no-distract"]
            || flags["full-height"] || flags.tag !== undefined
            || flags.directory !== undefined || command !== null;
        if (!machine) {
            const r = await hc("spawn", process.env.TERMINAL || "alacritty");
            if (r === null) process.exit(1);
            return;
        }
        // The command is a STRING (like the script's "$*"): callers
        // pass it quoted, argv can't express shell syntax.
        const tag = flags.tag ?? null;
        if (tag) {
            // Allocate WITHOUT switching focus (the verb-owned
            // allocation contract) before the rule references it —
            // a rule with tag=<missing> would place nowhere.
            const ok = await ensureTag(tag);
            if (!ok) process.exit(1);
        }
        const pid = await launchTerminal({
            command,
            directory: flags.directory ?? null,
            floating: flags.floating,
            urgent: flags.urgent,
            noDistract: flags["no-distract"],
            fullHeight: flags["full-height"],
            tag,
        });
        if (pid === null) process.exit(1);
    },
});
