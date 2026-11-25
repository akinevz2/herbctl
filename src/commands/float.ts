// src/commands/float.ts — the FLOAT-TOGGLE cycle machine (the migrated
// polyframes alt click; `float <mode>`'s dispatch surface retired, this
// verb carries the window-state cycle):
//
//   herbctl float --toggle [--wid 0x…]
//
//   minimized            -> unminimize into its frame (frame holds
//                           others: re-tile; frame empty: stay float,
//                           centered at current size)
//   floating, unfocused  -> focus + raise
//   floating, focused    -> minimize
//   tiled                -> float + raise
//
// Bare without --toggle is a usage error — the machine has no
// non-toggle meaning (float on/off are `focus`/`unfocus`).
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr } from "../lib/hc.js";
import { floatToggle } from "../lib/imperatives.js";

export default defineCommand({
    name: "float" as never,
    description:
        "the window-state cycle machine (float / focus / minimize / restore)",
    options: {
        toggle: option(z.boolean().default(false), {
            description:
                "cycle the window's state (minimized -> restore into frame; floating unfocused -> focus; floating focused -> minimize; tiled -> float)",
            short: "t",
            argumentKind: "flag",
        }),
        wid: option(z.string().optional(), {
            description: "cycle THIS window (default: the focused client)",
            short: "w",
        }),
    },
    handler: async ({ flags }) => {
        if (!flags.toggle) {
            throw new Error(
                "float: needs --toggle (float session entry/exit are `focus`/`unfocus`)",
            );
        }
        const wid = flags.wid ?? (await attr("clients.focus.winid")) ?? "";
        if (wid === "") throw new Error("float: no focused client");
        await floatToggle(wid);
    },
});
