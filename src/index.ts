#!/usr/bin/env bun

import { createCLI } from "@bunli/core";

import getAdvice from "./commands/get-advice.js";
import getBend from "./commands/get-bend.js";
import getBendi from "./commands/get-bendi.js";
import getBelow from "./commands/get-below.js";
import getDeck from "./commands/get-deck.js";
import getDedeck from "./commands/get-dedeck.js";
import getDive from "./commands/get-dive.js";
import getExplore from "./commands/get-explore.js";
import getExtracted from "./commands/get-extracted.js";
import getFocus from "./commands/get-focus.js";
import getForward from "./commands/get-forward.js";
import getHold from "./commands/get-hold.js";
import getHush from "./commands/get-hush.js";
import getNap from "./commands/get-nap.js";
import getQuiet from "./commands/get-quiet.js";
import getRotate from "./commands/get-rotate.js";
import getShuffle from "./commands/get-shuffle.js";
import getSkip from "./commands/get-skip.js";
import getSouth from "./commands/get-south.js";
import getToss from "./commands/get-toss.js";
import getTuck from "./commands/get-tuck.js";
import getVex from "./commands/get-vex.js";
import getVexi from "./commands/get-vexi.js";
import getWrench from "./commands/get-wrench.js";
import getZoom from "./commands/get-zoom.js";

import { name, version, description } from "../package.json" with { type: "json" };

const cli = await createCLI({
  name,
  version,
  description,
});

for (const command of [
  getSouth, getForward, getDeck, getDedeck, getExplore, getAdvice,
  getShuffle, getRotate, getSkip, getBelow, getDive, getToss,
  getTuck, getHold, getWrench, getVex, getBend, getVexi, getBendi,
  getQuiet, getHush, getNap, getZoom, getExtracted, getFocus,
]) {
  cli.command(command);
}

const [_node, _bin, command, ...args] = process.argv;
await cli.run([command ?? 'help', ...args]);
