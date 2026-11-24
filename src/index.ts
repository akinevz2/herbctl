#!/usr/bin/env bun

import { createCLI } from "@bunli/core";

import { registerCompletions } from "./lib/completions.js";
import { name, version, description } from "../package.json" with { type: "json" };

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
import newCmd from "./commands/new.js";
import addCmd from "./commands/add.js";
import tagspaceCmd from "./commands/tagspace.js";
import findCmd from "./commands/find.js";
import completionsCmd from "./commands/completions.js";

const COMMANDS = [
  jump, shift, frame, float, split, close, toggle,
  rotateTree,
  reload,
  zoomToggle,
  tile, spawn, move,
  expand,
  openCmd, runCmd,
  newCmd, addCmd, tagspaceCmd,
  findCmd, completionsCmd,
];

// The completion registry (lib/completions) fills ONCE at boot — the
// run palette and `completions --internal` both read it, no help-text
// scraping anywhere.
import { commandTreeText } from "./lib/commandTree.js";
import { type TailSpec, type ModeFlag } from "./lib/completions.js";
import { getTree } from "./lib/completions.js";

const VERB_TAILS: Record<string, TailSpec> = {
    tagspace: { name: "name", required: true, description: "the tagspace name" },
    close: { name: "name", required: false, description: "the tagspace to free (default: the focused one)" },
};

const MODE_FLAGS: Record<string, Record<string, ModeFlag[]>> = {
    close: {
        tagspace: [{ flag: "--empty", description: "free EVERY empty tagspace at once" }],
    },
    new: {
        terminal: [
            { flag: "--on", description: "attach on a remote tagspace (focus-stealing prevented)" },
            { flag: "--directory", description: "cd into <dir> first" },
        ],
    },
    add: {
        terminal: [
            { flag: "--on", description: "attach on a remote tagspace (focus-stealing prevented)" },
            { flag: "--directory", description: "cd into <dir> first" },
        ],
    },
};

registerCompletions(COMMANDS, VERB_TAILS, MODE_FLAGS);

const cli = await createCLI({
  name,
  version,
  description,
});

for (const command of COMMANDS) {
  cli.command(command);
}

// The root help surface is bunli's (the herbstutil simplicity, 2026-11:
// bunli's renderer IS width-aware — renderRootHelp pairs columns at
// ctx.terminal.width — so nothing is hand-printed here). Bare `herbctl`
// and bare `--help`/`help` all delegate to bunli's root help; `help
// <verb>` and `<verb> help` delegate to the verb's own --help.
const argv = process.argv.slice(2);
if (argv.includes("--command-tree")) {
  // the FULL verb/parameter structure — the declarative facts, printed:
  // usage tokens, tail parameters (with the blank semantics), flags and
  // their mode-scoped relations. No prompts, no execution.
  console.log(commandTreeText(getTree(), VERB_TAILS, MODE_FLAGS));
  process.exit(0);
}
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
