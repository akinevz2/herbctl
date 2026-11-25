// src/commands/windows.ts — the all-windows switcher (the migrated
// polyframes `windows`; the mod-g machine's no-hidden fallback):
//
//   herbctl windows
//
// Launcher mode: exec rofi in script mode (every VISIBLE window,
// focused EXCLUDED, MRU order). Backend mode (rofi re-invokes with
// $ROFI_RETV): rows for rofi on 0; bring on 1; jumpto on 10
// (right-click). The machine lives in lib/hidden.ts (sibling of the
// hidden picker, sharing the window order + row rendering).
import { defineCommand } from "@bunli/core";

import { windowsMenu } from "../lib/hidden.js";

export default defineCommand({
    name: "windows" as never,
    description:
        "the all-windows switcher (visible windows, focused excluded; the mod-g fallback)",
    handler: async () => {
        await windowsMenu();
    },
});
