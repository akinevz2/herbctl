// src/commands/get-skip.ts — bunli verb for the shiftDown chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, shiftDown } from "../lib/chains.js";

export default navCommand("shift-down", 'Shift down or remove', shiftDown);
