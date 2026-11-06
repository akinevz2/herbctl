// src/commands/get-shuffle.ts — bunli verb for the shiftUp chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, shiftUp } from "../lib/chains.js";

export default navCommand("shift-up", 'Shift window up', shiftUp);
