// src/commands/get-vex.ts — bunli verb for the splitRightCycle chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, splitRightCycle } from "../lib/chains.js";

export default navCommand("split-right-cycle", '[$Mod-v] Split right at half and cycle into the new frame', splitRightCycle);
