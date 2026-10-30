// src/commands/get-dive.ts — bunli verb for the getDive chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getDive } from "../lib/chains.js";

export default navCommand("get-dive", '[$ModCtrl-a] Shift the window left, else focus the frame left, else split left and shift', getDive);
