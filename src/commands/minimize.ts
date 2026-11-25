// src/commands/minimize.ts — minimize, BARE (reparented from
// `toggle minimize`; the toggle dispatch surface retired):
//
//   herbctl minimize              the minimize machine — minimize the
//                                 focused client; an EMPTY focused frame
//                                 hands off to the hidden picker (the
//                                 mod-g machine, lib/hidden.ts)
//   herbctl minimize --focused    the TARGETED machine bare — minimize
//                                 the focused client, or close_or_remove
//                                 the empty focused frame (the
//                                 hc_minimize idiom)
//   --wid/-c/-f                   the targeted machine against an
//                                 explicit winid / the selected tiling
//                                 client / the focused float
//
// The bare machine and the toggle machine live in lib/chains.ts, the
// targeted machine in lib/minimize.ts — this module is only the
// dispatch surface.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { minimizeOrPicker, minimizeToggle } from "../lib/chains.js";
import { dismissWindow } from "../lib/imperatives.js";
import minimizeVerb from "../lib/minimize.js";

export default defineCommand({
    name: "minimize" as never,
    description: "minimize the focused client (empty frame: the hidden picker); flags = the targeted machine",
    options: {
        wid: option(z.string().optional(), {
            description: "targeted machine: minimize THIS window", short: "w",
        }),
        "frame-selected": option(z.boolean().default(false), {
            description: "targeted machine: the selected client of the tiling frame",
            short: "c",
            argumentKind: "flag",
        }),
        float: option(z.boolean().default(false), {
            description: "targeted machine: the focused floating window",
            short: "f",
            argumentKind: "flag",
        }),
        focused: option(z.boolean().default(false), {
            description:
                "targeted machine bare — minimize the focused client, or close_or_remove the empty focused frame (the hc_minimize idiom)",
            short: "F",
            argumentKind: "flag",
        }),
        dismiss: option(z.boolean().default(false), {
            description:
                "targeted TOGGLE — minimized: unminimize + float + center; tiling unfocused: minimize + remove the emptied frame (focus handed back); needs --wid or targets the focused window",
            short: "d",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags }) => {
        // The DISMISS machine: the targeted toggle (the migrated
        // polyframes middle click). --wid wins; bare targets the
        // focused window. Mutually exclusive with the other targeting
        // flags (dismiss owns its own frame removal / restore half).
        if (flags.dismiss) {
            if (flags["frame-selected"] || flags.float || flags.focused) {
                throw new Error("minimize: --dismiss combines with --wid only");
            }
            const wid = flags.wid
                ?? (await attr("clients.focus.winid")) ?? "";
            if (wid === "") throw new Error("minimize: no focused client");
            await dismissWindow(wid);
            return;
        }
        // Bare: the minimize machine (minimize the focused client, an
        // empty frame -> the hidden picker). Targeting flags: the
        // targeted minimize machine (not a duplicate — it is the
        // WHICH-window half of the same surface).
        const targeted = flags.wid !== undefined
            || flags["frame-selected"]
            || flags.float
            || flags.focused;
        if (targeted) {
            const handler = (minimizeVerb as unknown as {
                handler: (ctx: never) => Promise<void>;
            }).handler;
            await handler({ flags, positional: [] } as never);
            return;
        }
        await minimizeOrPicker();
    },
});
