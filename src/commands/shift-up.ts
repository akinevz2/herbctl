// src/commands/get-shuffle.ts — bunli verb for the shiftUp chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, shiftUp } from "../lib/chains.js";

export default navCommand("shift-up", '[$ModShift-w] Shift window up / cycle -1 / cycle+rotate frames (the shift-up ladder)', shiftUp);
