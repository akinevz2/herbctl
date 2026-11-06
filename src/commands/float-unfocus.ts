// src/commands/float-unfocus.ts — bunli verb for the floatUnfocus
// machine (see src/lib/focus.ts for the port and the source binding).
import { navCommand } from "../lib/chains.js";
import { floatUnfocus } from "../lib/focus.js";

export default navCommand("float-unfocus", "Unfloat/focus layers", floatUnfocus);
