// src/commands/get-explore.ts — bunli verb for the getExplore chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getExplore } from "../lib/chains.js";

export default navCommand("get-explore", '[$Mod-e] Cycle frames backward, or explode when it is the last split', getExplore);
