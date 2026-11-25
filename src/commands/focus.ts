// src/commands/focus.ts — the float-session focus manager (the
// $Mod-f machine; reparented from `float focus`) + the GROUP-CYCLE
// step (`--frame <left|right>` — focus the previous/next member of
// the window's (frame, class) group; the migrated polyframes scroll
// cycle core).
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { floatFocus } from "../lib/float-focus.js";
import { focusFrameStep } from "../lib/imperatives.js";
import { attr } from "../lib/hc.js";

export default defineCommand({
    name: "focus" as never,
    description: "focus the float session (the layer focus manager)",
    options: {
        frame: option(z.enum(["left", "right"]).optional(), {
            description:
                "step focus to the previous/next member of the window's (frame, class) group (default window: the focused one)",
            short: "m",
        }),
    },
    handler: async ({ flags }) => {
        if (flags.frame !== undefined) {
            const wid = (await attr("clients.focus.winid")) ?? "";
            if (wid === "") throw new Error("focus: no focused client");
            await focusFrameStep(wid, flags.frame);
            return;
        }
        await floatFocus();
    },
});
