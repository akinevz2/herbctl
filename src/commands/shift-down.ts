// src/commands/get-skip.ts — bunli verb for the shiftDown chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, shiftDown } from "../lib/chains.js";

export default navCommand("shift-down", '[$ModShift-s] Empty frame removed; multi-window frame shifts down (splitting a bottom frame when needed)', shiftDown);
