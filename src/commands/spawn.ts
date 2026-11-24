// src/commands/spawn.ts — one-shot `herbstclient rule once` spawns
// with typed parameters (the migrated polyframes spawn; the dots
// spawning convention), PLUS the terminal machine as a mode:
//
//   herbctl spawn [--class X ...] -- xmessage ...args
//   herbctl spawn terminal [--floating] [--urgent] [--no-distract]
//       [-d <dir>] ["<command string>"]
//
// In terminal mode the machine is lib/terminal.ts (the migrated
// launch_alacritty): rule-scoped float/urgent/no-distract switches,
// the paused-for-dismiss park, a login shell with no command string.
// The spawn criteria flags (--class/--instance/--title/--tag/
// --switchtag) and --center/--cmd are NOT terminal-mode options and
// error loudly rather than silently applying a graphical rule.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { spawnOnce } from "../lib/rule-spawn.js";
import { launchTerminal } from "../lib/terminal.js";

export default defineCommand({
    name: "spawn" as never,
    description: "spawn a client with a rule",
    options: {
        class: option(z.string().optional(), {
            description: "WM_CLASS match criterion", short: "c",
        }),
        instance: option(z.string().optional(), {
            description: "WM_INSTANCE match criterion", short: "i",
        }),
        title: option(z.string().optional(), {
            description: "window title match criterion", short: "t",
        }),
        tag: option(z.string().optional(), {
            description: "tag NAME to place the window on", short: "a",
        }),
        floating: option(z.enum(["on", "off"]).optional(), {
            description: "floating consequence (center via --center)", short: "f",
        }),
        switchtag: option(z.enum(["on", "off"]).optional(), {
            description: "follow the window to its tag", short: "s",
        }),
        focus: option(z.boolean().default(false), {
            description: "focus the new client", short: "F",
            argumentKind: "flag",
        }),
        center: option(z.boolean().default(false), {
            description:
                "float + focus + follow + center the window (guard-dialog preset)", short: "C",
            argumentKind: "flag",
        }),
        cmd: option(z.string().min(1).optional(), {
            description:
                "spawn via shell from a STRING (use when the command has flag-like args; '--' positional can't shield dash tokens)",
        }),
        urgent: option(z.boolean().default(false), {
            description: "terminal: raise the urgent hint post-attach", short: "u",
            argumentKind: "flag",
        }),
        "no-distract": option(z.boolean().default(false), {
            description: "terminal: the terminal does NOT take focus on attach", short: "n",
            argumentKind: "flag",
        }),
        directory: option(z.string().optional(), {
            description: "terminal: cd into <dir> first (a leading ~ is expanded)", short: "d",
        }),
    },
    handler: async ({ flags, positional }) => {
        // TERMINAL MODE: `spawn terminal [...]` is the migrated
        // launch_alacritty.
        if (positional[0] === "terminal") {
            for (const taken of ["class", "instance", "title", "tag", "switchtag"] as const) {
                if (flags[taken] !== undefined) {
                    throw new Error(
                        `spawn terminal: --${taken.replace(/([A-Z])/g, "-$1").toLowerCase()}`
                        + ` is a graphical-spawn criterion, not a terminal option`,
                    );
                }
            }
            if (flags.center || flags.cmd) {
                throw new Error(
                    "spawn terminal: --center/--cmd are graphical-spawn options, not terminal options",
                );
            }
            // spawn's --floating is the rule consequence enum (on/off);
            // the terminal machine wants the boolean.
            const rest = positional.slice(1);
            const pid = await launchTerminal({
                command: rest.join(" ") || null,
                directory: flags.directory ?? null,
                floating: flags.floating === "on",
                urgent: flags.urgent,
                noDistract: flags["no-distract"],
            });
            if (pid === null) process.exit(1);
            return;
        }
        const [cmd = "", ...args] = positional;
        if (flags.cmd && (cmd !== "" || args.length > 0)) {
            throw new Error(
                "Usage: herbctl spawn [--flags] <command> [args...] — "
                + "or herbctl spawn --cmd '<shell command>' — not both",
            );
        }
        if (!flags.cmd && !cmd) {
            throw new Error("Usage: herbctl spawn [--flags] -- <command> [args...]");
        }
        await spawnOnce(cmd, args, {
            cls: flags.class,
            instance: flags.instance,
            title: flags.title,
            tag: flags.tag,
            floating: flags.floating,
            switchtag: flags.switchtag,
            focus: flags.focus,
            center: flags.center,
            cmdString: flags.cmd,
        });
    },
});
