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

const COMMANDS: [string, { name: string; description: string }][] = [
  ["get-south", getSouth], ["get-forward", getForward], ["get-deck", getDeck],
  ["get-dedeck", getDedeck], ["explode-frame", explodeFrame],
  ["focus-frame-left", focusFrameLeft], ["shift-up", shiftUp],
  ["rotate-tree", rotateTree], ["shift-down", shiftDown],
  ["split-down", splitDown], ["shift-left", shiftLeft], ["shift-right", shiftRight],
  ["new-frame", newFrame], ["close-or-remove", closeOrRemove],
  ["xkill-or-close", xkillOrClose], ["split-right-cycle", splitRightCycle],
  ["focus-frame-down", focusFrameDown], ["split-right-focus", splitRightFocus],
  ["split-bottom-focus", splitBottomFocus], ["close-window", closeWindow],
  ["fullscreen-toggle", fullscreenToggle], ["minimize-toggle", minimizeToggle],
  ["zoom", zoomToggle], ["float-yank", floatYank], ["float-focus", floatFocus],
];

// The root help surface is OURS (the 2026-11 width contract): bunli's
// built-in renderer ignores the terminal width, so bare `herbctl`,
// `help` and bare `--help` render here with the width-aware helpers —
// terse desc lines that pair when they fit; long prose stays in the
// per-verb chains' docstrings. `help <verb>` delegates to the verb's
// own --help.
const argv = process.argv.slice(2);
if (
  argv.length === 0 ||
  (argv.length === 1 && ["help", "--help", "-h"].includes(argv[0]!))
) {
  const { echoHelpList, wrapHelp } = await import("./lib/lines.js");
  console.log(`${name} ${version}`);
  for (const line of wrapHelp(description)) console.log(`  ${line}`);
  console.log("");
  echoHelpList(
    name,
    "usage: herbctl <verb> [args]   (help <verb> for a verb; per-verb needs a running herbstluftwm)",
    COMMANDS.map(([verb, cmd]) => {
      const desc: string = (cmd as { description: string }).description;
      return `${verb}\t${desc.replaceAll("\n", " ")}`;
    }),
  );
  process.exit(0);
}

if (argv[0] === "help") {
  const rest = argv.slice(1);
  // cli.run() re-reads process.argv — rewrite it, not the slice
  process.argv = [
    process.argv[0], process.argv[1],
    ...(rest.length === 0 ? ["--help"] : [...rest, "--help"]),
  ];
}

const [_node, _bin, command, ...args] = process.argv;
await cli.run([command ?? 'help', ...args]);
