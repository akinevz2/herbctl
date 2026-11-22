#!/usr/bin/env bun

import { createCLI } from "@bunli/core";

import jump from "./commands/jump.js";
import shift from "./commands/shift.js";
import frame from "./commands/frame.js";
import float from "./commands/float.js";
import split from "./commands/split.js";
import close from "./commands/close.js";
import toggle from "./commands/toggle.js";
import rotateTree from "./commands/rotate-tree.js";
import zoomToggle from "./commands/zoom.js";
import reload from "./commands/reload.js";
import tile from "./commands/tile.js";
import spawn from "./commands/spawn.js";
import move from "./commands/move.js";
import expand from "./commands/expand.js";
import openCmd from "./commands/open.js";
import runCmd from "./commands/run.js";

import { name, version, description } from "../package.json" with { type: "json" };

const cli = await createCLI({
  name,
  version,
  description,
});

for (const command of [
  jump, shift, frame, float, split, close, toggle,
  rotateTree,
  reload,
  tile, spawn, move,
  expand,
  openCmd, runCmd,
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
  // Bare `herbctl` is the palette shorthand: the run verb IS the entry
  // verb (its bare form is the command palette; Tab completes a single
  // command via the completion palette). --help and `help` keep the
  // root help.
  process.argv = [process.argv[0], process.argv[1], "run"];
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
