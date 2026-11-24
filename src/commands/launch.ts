// src/commands/launch.ts — rofi drun/run app launcher (moved from
// polyframes; the autostart's APPLAUNCHER points here). Extra args are
// passed through to rofi.
import { defineCommand } from "@bunli/core";
import { spawnSync } from "node:child_process";

export default defineCommand({
    name: "launch" as never,
    description: "Rofi drun/run app launcher",
    handler: async ({ positional }) => {
        // the dots spawn env: WAYLAND_DISPLAY stripped (WSLg's socket
        // makes dual-backend rofi abort), DISPLAY defaulted (the WSL2
        // convention)
        const { WAYLAND_DISPLAY: _strip, ...env } = process.env;
        env.DISPLAY = process.env.DISPLAY || "localhost:0.0";
        const r = spawnSync("rofi", [
            "-modi", "drun,run",
            "-show", "drun",
            "-theme", `${process.env.HOME}/.config/rofi/launcher.rasi`,
            // launcher.rasi sets auto-select true for the script-mode
            // menus (pre-highlighted row); the app launcher must not
            // fire when a filter leaves a single entry.
            "-no-auto-select",
            ...positional,
        ], { env, stdio: "inherit" });
        process.exitCode = r.status ?? 1;
    },
});
