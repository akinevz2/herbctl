// src/lib/split-launch.ts — run a launcher, then give the launched
// application its own frame (port of the hc_split-launch bash script;
// hangs off `herbctl split-launch`).
//
// The launcher runs synchronously (rofi blocks while open); after it
// exits, the wrapper waits for the launched application's window to
// attach to the tag that was focused when it was invoked, then:
//   - the application is focused (jumpto — a fresh client cannot be
//     relied on to hold focus);
//   - IF its frame now holds more than one window, the frame is split
//     along its longest side and the application is shifted into the
//     new half — reproducing the old split-first end state (app alone
//     in a fresh frame) without the old binding's flaws: cancelling
//     the launcher no longer leaves an orphan empty frame, and a
//     window that lands alone never triggers a split.
//
// Split direction: width >= height -> right half empty (split right,
// shift right); otherwise bottom (split bottom, shift bottom) — the
// same choice hlwm's `split auto` makes by geometry.

import { attr, hc, listClientsByTag } from "./hc.js";

/** Spawn a process fully detached (own session, no stdio ties). */
function spawnDetached(cmd: string, args: string[]): void {
    const { WAYLAND_DISPLAY, ...rest } = process.env;
    const child = Bun.spawn([cmd, ...args], {
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: { ...rest, DISPLAY: process.env.DISPLAY || "localhost:0.0" },
    });
    child.unref();
}

/** Exit code of a synchronous child (the launcher blocks while open). */
async function runSync(cmd: string, args: string[]): Promise<number> {
    const { WAYLAND_DISPLAY, ...rest } = process.env;
    const proc = Bun.spawn([cmd, ...args], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: { ...rest, DISPLAY: process.env.DISPLAY || "localhost:0.0" },
    });
    return await proc.exited;
}

export async function splitLaunch(cmd: string, args: string[]): Promise<void> {
    const tag = (await attr("tags.focus.name")) ?? "";
    const before = new Set(await listClientsByTag(tag));

    // The launcher blocks while its rofi is open; the application
    // launches from inside it.
    const code = await runSync(cmd, args);
    if (code !== 0) {
        // A failed launcher never splits — no orphan frames.
        return;
    }

    // Wait for the new window (up to ~15 s — the user may browse rofi).
    let wid = "";
    for (let i = 0; i < 150 && wid === ""; i += 1) {
        for (const w of await listClientsByTag(tag)) {
            if (!before.has(w)) {
                wid = w;
                break;
            }
        }
        if (wid === "") await new Promise((r) => setTimeout(r, 100));
    }
    if (wid === "") return; // nothing launched (cancel) -> no split

    await hc("lock");
    try {
        // Focus the application so "current frame" is ITS frame.
        await hc("jumpto", wid);

        const wcount = Number((await attr("tags.focus.curframe_wcount")) ?? "0");
        if (wcount > 1) {
            const geo = (await attr("tags.focus.tiling.focused_frame.content_geometry"))
                ?? "0x0+0+0";
            const m = geo.match(/^(\d+)x(\d+)/);
            const w = m ? Number(m[1]) : 0;
            const h = m ? Number(m[2]) : 0;
            // width >= height -> right half empty; otherwise bottom —
            // the same choice hlwm's `split auto` makes by geometry.
            if (w >= h) {
                await hc("chain", ".", "split", "right", ".", "shift", "right");
            } else {
                await hc("chain", ".", "split", "bottom", ".", "shift", "bottom");
            }
        }
    } finally {
        await hc("unlock");
    }
}
