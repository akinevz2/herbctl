// src/commands/hidden.ts — the minimized-window picker verb, migrated
// from polyframes `hidden` (the mod-g machine):
//
//   no hidden clients     the windows switcher, focused excluded
//                         (delegated to polyframes windows); the only
//                         unminimized window being the focused one
//                         minimizes it instead
//   exactly one hidden    revealed directly, no menu
//   more                  the rofi hidden-windows menu
//
// The machine lives in lib/hidden.ts — this module is the dispatch
// surface. Launcher mode: the machine's exit status (non-zero on rofi
// cancel) becomes this process' exit code, so shell chains keep
// working; backend mode: rows for rofi, exit 0 like the shell script.
import { defineCommand } from "@bunli/core";
import { hiddenMenu } from "../lib/hidden.js";

export default defineCommand({
    name: "hidden" as never,
    description: "the minimized-window picker (the mod-g machine)",
    handler: async () => {
        await hiddenMenu();
    },
});
