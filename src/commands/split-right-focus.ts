// src/commands/split-right-focus.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { splitRightFocus } from "../lib/chains.js";

export default navCommand("split-right-focus", 'Split right, focus', splitRightFocus);
