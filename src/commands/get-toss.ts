// src/commands/get-toss.ts — bunli verb for the getToss chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getToss } from "../lib/chains.js";

export default navCommand("get-toss", '[$ModCtrl-e] Shift the window right, else split right and focus the new frame', getToss);
