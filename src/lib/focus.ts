// src/commands/float-focus.ts — float-focus: the hc_focus float-register
// machine (~/dots/herbst_focus/.local/bin/hc_focus, the $Mod-f key —
// distinct from zoom, which is hc_zoom on $ModCtrl-f):
//
//   Pre-scan the first VISIBLE float on the tag (the only candidate
//   the floating layer can focus; a fallback for the focus read that
//   may lag right after the layer switch).
//
//   floating_focused FALSE:
//     TRY the layer switch (floating_focused on; fails when no
//     non-minimized float exists).
//     Success -> the float it focused STAYS floating when the focused
//     frame holds children (no stacking); an EMPTY frame -> UN-FLOAT
//     the float into it (the register chain: fullscreen/pseudotile/
//     floating off — NO jumpto, the window is already focused; NO
//     floating_focused write — hlwm tracks the register on un-float).
//     Failure -> float the current window, but ONLY when the focused
//     frame's layout algorithm is "max": flags off, hc_center frame
//     (the size-keeping lift), close the vacated frame when it reads
//     zero clients (`remove` — Mod-f owns frame closing on this path),
//     hc_fit_to frame. Afterwards the focused frame is set to the max
//     algorithm regardless (the script's unconditional tail).
//
//   floating_focused TRUE (a float has focus): DIRECT un-float — no
//   hc_tile (that is Mod-x's register; the window re-tiles into the
//   frame below whatever it holds). The frame's client_count is read
//   first and unused — the script does exactly that.
//
//   NO script-level lock: the helpers take their own
//   reference-counted WM locks (hc_focus's header).

import { attrRaw, hc, helper, listClientsByTag } from "./hc.js";

export async function floatFocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");

    // Pre-scan the first visible (non-minimized) float on the tag.
    let floatWid = "";
    if (tag) {
        for (const c of await listClientsByTag(tag)) {
            const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
            if (floating === "true") {
                const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
                if (minimized === "false") {
                    floatWid = c;
                    break;
                }
            }
        }
    }

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff !== "true") {
        // a) false; b) try the layer switch.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // c) switch succeeded. The PRE-SCANNED float wid is PRIMARY —
            // clients.focus may lag a settle-tick after the switch.
            const fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            const wid = floatWid || (await attrRaw("clients.focus.winid"));
            if (fcc === "0") {
                // e) un-float the float into the empty frame (no jumpto —
                // it is already focused; no register write — hlwm tracks
                // it on un-float).
                await hc(
                    "chain",
                    ",", "attr", `clients.${wid}.fullscreen`, "off",
                    ",", "attr", `clients.${wid}.pseudotile`, "off",
                    ",", "attr", `clients.${wid}.floating`, "off",
                );
            }
            // f) otherwise: terminate — the float stays floating, the
            // floating layer holds focus (no stacking).
            return;
        }

        // g) the switch failed (no float to focus): float the current
        // window — but ONLY in the max layout.
        const algo = await attrRaw("tags.focus.tiling.focused_frame.algorithm");
        if (algo === "max") {
            const wid = await attrRaw("clients.focus.winid");
            if (wid) {
                await hc(
                    "chain",
                    ",", "attr", `clients.${wid}.fullscreen`, "off",
                    ",", "attr", `clients.${wid}.pseudotile`, "off",
                );
                await helper("hc_center", ["frame"]);
                // The lifted window vacated its tile — when the focused
                // frame reads zero clients now, close it (Mod-f's
                // register; removes the split).
                const vcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "1";
                if (vcc === "0") {
                    await hc("remove");
                }
                await helper("hc_fit_to", ["frame"]);
            }
        }
        await hc("attr", "tags.focus.tiling.focused_frame.algorithm", "max");
        return;
    }

    // h) floating_focused TRUE: a floating window has focus. Direct
    // un-float — NO hc_tile (Mod-x's register).
    let wid = await attrRaw("clients.focus.winid");
    if (!wid) wid = floatWid;
    if (!wid) return;
    await attrRaw("tags.focus.tiling.focused_frame.client_count");
    await hc(
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    );
}

// float-unfocus — the $Mod-x command (herbctl v1.4.0; hc_floatx, the
// old $Mod-x register, moves to $ModCtrl-x):
//
//   floating_focused TRUE (a float holds focus):
//     focused tiling frame EMPTY (curframe_wcount = 0) -> UN-FLOAT the
//       focused float into it (the register chain: fullscreen/
//       pseudotile/floating off — no jumpto, the window is already
//       focused; hlwm tracks the register on un-float).
//     otherwise -> focus the TILING layer (floating_focused off) —
//       the float stays floating, untouched.
//
//   floating_focused FALSE (the tiling layer owns focus):
//     recall the float — focus the floating layer's window (ONLY
//     focus, NO un-float) via floating_focused on (fails fail-soft
//     when no non-minimized float exists), jumpto the float (the
//     pre-scanned wid is PRIMARY — clients.focus may lag a
//     settle-tick after the layer switch), then hc_center root.
//     Afterwards the focused tiling window — captured BEFORE the
//     layer switch hands focus away — becomes a small companion
//     float: half width × half height of the work area (a quarter of
//     the screen), its full outline parked flush in the top-left
//     corner. The content rect is inset by the floating deco margins
//     (theme.floating reads — the deterministic margin source; the
//     live decoration read races hlwm's async float-deco apply) so
//     the WINDOW's x/y offsets are zero, borders and title included.
//
// Fail-soft everywhere; no script-level lock (hc_center takes its own
// reference-counted WM lock — the hc_focus header convention).
export async function floatUnfocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");

    // Pre-scan the first visible (non-minimized) float on the tag.
    let floatWid = "";
    if (tag) {
        for (const c of await listClientsByTag(tag)) {
            const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
            if (floating === "true") {
                const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
                if (minimized === "false") {
                    floatWid = c;
                    break;
                }
            }
        }
    }

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff === "true") {
        // a float has focus. clients.focus may lag a settle-tick —
        // fall back to the pre-scanned wid (the floatFocus pattern).
        let wid = await attrRaw("clients.focus.winid");
        if (!wid) wid = floatWid;
        const cwc = (await attrRaw("tags.focus.curframe_wcount")) || "1";
        if (cwc === "0" && wid) {
            // un-float the focused float into the empty focused frame.
            await hc(
                "chain",
                ",", "attr", `clients.${wid}.fullscreen`, "off",
                ",", "attr", `clients.${wid}.pseudotile`, "off",
                ",", "attr", `clients.${wid}.floating`, "off",
            );
            return;
        }
        // populated focused frame: hand focus to the tiling layer —
        // the float stays floating, untouched.
        await hc("attr", "tags.focus.floating_focused", "off");
        return;
    }

    // the tiling layer owns focus: recall the float — focus only, no
    // un-float — then center it to root. The focused tiling window is
    // captured BEFORE the layer switch (the jumpto hands focus away)
    // and becomes a small companion float afterwards: half width ×
    // half height of the work area, its full outline parked flush in
    // the top-left corner — the content rect is inset by the floating
    // deco margins (theme.floating reads, the deterministic margin
    // source: the live decoration read races hlwm's async float-deco
    // apply) so the WINDOW's x/y offsets are zero, borders included.
    const tilingWid = await attrRaw("clients.focus.winid");
    if ((await hc("attr", "tags.focus.floating_focused", "on")) === null) {
        return; // no non-minimized float exists — fail-soft terminate
    }
    const wid = floatWid || (await attrRaw("clients.focus.winid"));
    if (wid) {
        await hc("jumpto", wid);
    }
    await helper("hc_center", ["root"]);

    if (tilingWid && tilingWid !== wid) {
        await hc(
            "chain",
            ",", "attr", `clients.${tilingWid}.fullscreen`, "off",
            ",", "attr", `clients.${tilingWid}.pseudotile`, "off",
            ",", "attr", `clients.${tilingWid}.floating`, "on",
        );
        const rootGeom = await attrRaw("tags.focus.tiling.root.content_geometry");
        const rm = rootGeom.match(/^(\d+)x(\d+)([+-]\d+)([+-]\d+)$/);
        if (rm) {
            const numOr = (s: string, d: number): number => {
                const n = Number(s);
                return Number.isFinite(n) ? n : d;
            };
            const bw = numOr(await attrRaw("theme.floating.border_width"), 2);
            const left = Math.max(0, bw + numOr(await attrRaw("theme.floating.padding_left"), 0));
            const top = Math.max(0, bw + numOr(await attrRaw("theme.floating.padding_top"), 0)
                + numOr(await attrRaw("theme.floating.title_height"), 0)
                + numOr(await attrRaw("theme.floating.title_depth"), 0));
            const w = Math.floor(Number(rm[1]) / 2);
            const h = Math.floor(Number(rm[2]) / 2);
            await helper("hc_resize", [tilingWid, `${w}x${h}+${left}+${top}`]);
        }
    }
}
