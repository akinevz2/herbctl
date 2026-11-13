// src/commands/float-unfocus.ts
// machine (see src/lib/focus.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { } from "../lib/chains.js";
import { floatUnfocus } from "../lib/float-unfocus.js";

export default navCommand("float-unfocus", "Unfloat/focus layers", floatUnfocus);
