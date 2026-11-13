#!/usr/bin/env bun

import { createCLI } from "@bunli/core";

import focusFrameLeft from "./commands/focus-frame-left.js";
import focusFrameDown from "./commands/focus-frame-down.js";
import splitBottomFocus from "./commands/split-bottom-focus.js";
import splitDown from "./commands/split-down.js";
import getDeck from "./commands/get-deck.js";
import getDedeck from "./commands/get-dedeck.js";
import shiftLeft from "./commands/shift-left.js";
import explodeFrame from "./commands/explode-frame.js";
import floatYank from "./commands/float-yank.js";
import floatFocus from "./commands/float-focus.js";
import floatUnfocus from "./commands/float-unfocus.js";
import getForward from "./commands/get-forward.js";
import closeOrRemove from "./commands/close-or-remove.js";
import fullscreenToggle from "./commands/fullscreen-toggle.js";
import minimizeToggle from "./commands/minimize-toggle.js";
import closeWindow from "./commands/close-window.js";
import rotateTree from "./commands/rotate-tree.js";
import shiftUp from "./commands/shift-up.js";
import shiftDown from "./commands/shift-down.js";
import getSouth from "./commands/get-south.js";
import shiftRight from "./commands/shift-right.js";
import newFrame from "./commands/new-frame.js";
import splitRightCycle from "./commands/split-right-cycle.js";
import splitRightFocus from "./commands/split-right-focus.js";
import xkillOrClose from "./commands/xkill-or-close.js";
import zoomToggle from "./commands/zoom.js";
import reload from "./commands/reload.js";
import center from "./commands/center.js";
import fit from "./commands/fit.js";
import corner from "./commands/corner.js";
import resize from "./commands/resize.js";
import tile from "./commands/tile.js";
import spawn from "./commands/spawn.js";
import move from "./commands/move.js";
import minimize from "./commands/minimize.js";
import splitNew from "./commands/split-new.js";
import splitLaunch from "./commands/split-launch.js";
import closeTiling from "./commands/close-tiling.js";

import { name, version, description } from "../package.json" with { type: "json" };

const cli = await createCLI({
  name,
  version,
  description,
});

for (const command of [
  getSouth, getForward, getDeck, getDedeck, explodeFrame, focusFrameLeft,
  shiftUp, rotateTree, shiftDown, splitDown, shiftLeft, shiftRight,
  newFrame, closeOrRemove, xkillOrClose, splitRightCycle, focusFrameDown, splitRightFocus, splitBottomFocus,
  closeWindow, fullscreenToggle, minimizeToggle, zoomToggle, floatYank, floatFocus, floatUnfocus, reload,
  center, fit, corner, resize, tile, spawn, move, minimize, splitNew, splitLaunch, closeTiling,
]) {
  cli.command(command);
}

// The root help surface is bunli's (the herbstutil simplicity, 2026-11:
// bunli's renderer IS width-aware — renderRootHelp pairs columns at
// ctx.terminal.width — so nothing is hand-printed here). Bare `herbctl`
// and bare `--help`/`help` all delegate to bunli's root help; `help
// <verb>` and `<verb> help` delegate to the verb's own --help.
const argv = process.argv.slice(2);
if (argv.length === 0) {
  process.argv = [process.argv[0], process.argv[1], "--help"];
} else if (argv[0] === "help") {
  const rest = argv.slice(1);
  // cli.run() re-reads process.argv — rewrite it, not the slice
  process.argv = [
    process.argv[0], process.argv[1],
    ...(rest.length === 0 ? ["--help"] : [...rest, "--help"]),
  ];
} else if (argv.length === 2 && argv[1] === "help") {
  process.argv = [process.argv[0], process.argv[1], argv[0], "--help"];
}

const [_node, _bin, command, ...args] = process.argv;
await cli.run([command ?? 'help', ...args]);
