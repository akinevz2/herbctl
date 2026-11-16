// src/commands/terminal.ts — the migrated launch_alacritty: run a
// command string inside a spawned $TERMINAL (default alacritty),
// WM-managed, with the rule-scoped --floating/--urgent/--no-distract
// switches and the -d <dir> cd-first interface.
//
//   herbctl terminal --floating -d ~/dots -- 'make status'
//
// The command runs under an interactive bash delegated to
// paused-for-dismiss_idle: when it exits, the wrapper reports the
// status and parks for ONE key press, then the terminal closes. With
// no command string, the command is an interactive login shell in
// <dir>. See lib/terminal.ts for the full contract.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { launchTerminal } from "../lib/terminal.js";

export default defineCommand({
    name: "terminal" as never,
    description: "Spawn $TERMINAL running a command string (the migrated launch_alacritty)",
    options: {
        floating: option(z.boolean().default(false), {
            description: "float the terminal once it attaches (rule-owned)", short: "f",
            argumentKind: "flag",
        }),
        urgent: option(z.boolean().default(false), {
            description: "raise the urgent hint post-attach (no focus steal)", short: "u",
            argumentKind: "flag",
        }),
        "no-distract": option(z.boolean().default(false), {
            description: "the terminal does NOT take focus on attach", short: "n",
            argumentKind: "flag",
        }),
        directory: option(z.string().optional(), {
            description: "cd into <dir> first (a leading ~ is expanded)", short: "d",
        }),
    },
    handler: async ({ flags, positional }) => {
        // The command is a STRING (like the script's "$*"): callers
        // pass it quoted, argv can't express shell syntax. With no
        // command string, the terminal runs a login shell in <dir>.
        await launchTerminal({
            command: positional.join(" ") || null,
            directory: flags.directory ?? null,
            floating: flags.floating,
            urgent: flags.urgent,
            noDistract: flags["no-distract"],
        });
    },
});
