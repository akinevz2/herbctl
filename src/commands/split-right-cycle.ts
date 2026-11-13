// src/commands/split-right-cycle.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { splitRightCycle } from "../lib/chains.js";

export default navCommand("split-right-cycle", 'Split right, cycle', splitRightCycle);
