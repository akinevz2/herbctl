// src/commands/get-explore.ts — bunli verb for the explodeFrame chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, explodeFrame } from "../lib/chains.js";

export default navCommand("explode-frame", '[$Mod-e] Cycle frames backward, or explode when it is the last split', explodeFrame);
