// src/commands/get-toss.ts — bunli verb for the shiftRight chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, shiftRight } from "../lib/chains.js";

export default navCommand("shift-right", '[$ModCtrl-e] Shift the window right, else split right and focus the new frame', shiftRight);
