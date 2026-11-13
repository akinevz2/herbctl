// src/commands/explode-frame.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { explodeFrame } from "../lib/chains.js";

export default navCommand("explode-frame", 'Cycle or explode', explodeFrame);
