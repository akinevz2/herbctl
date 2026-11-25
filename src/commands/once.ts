// src/commands/once.ts — one-shot `herbstclient rule once` spawns
// with typed parameters (the migrated polyframes spawn; the dots
// spawning convention) for GRAPHICAL apps:
//
//   herbctl once [--class X ...] -- xmessage ...args
//   herbctl once --cmd '<shell command>'
//
// "once" names the machinery honestly: one once-rule, armed then
// fired on the next matching attach. The terminal MACHINE is
// `herbctl terminal` (the migrated launch_alacritty); `spawn` is a
// retired alias pointing there / here.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { spawnOnce } from "../lib/rule-spawn.js";

export default defineCommand({
    name: "once" as never,
    description:
        "spawn a client ONCE with a rule (the WM/agent automation surface)",
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
    },
    handler: async ({ flags, positional }) => {
        const [cmd = "", ...args] = positional;
        if (flags.cmd && (cmd !== "" || args.length > 0)) {
            throw new Error(
                "Usage: herbctl once [--flags] <command> [args...] — "
                + "or herbctl once --cmd '<shell command>' — not both",
            );
        }
        if (!flags.cmd && !cmd) {
            throw new Error("Usage: herbctl once [--flags] -- <command> [args...]");
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
