// src/commands/get-dive.ts — bunli verb for the shiftLeft chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, shiftLeft } from "../lib/chains.js";

export default navCommand("shift-left", 'Shift or focus left', shiftLeft);
