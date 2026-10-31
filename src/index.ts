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
  closeWindow, fullscreenToggle, minimizeToggle, zoomToggle, floatYank, floatFocus,
]) {
  cli.command(command);
}

const [_node, _bin, command, ...args] = process.argv;
await cli.run([command ?? 'help', ...args]);
