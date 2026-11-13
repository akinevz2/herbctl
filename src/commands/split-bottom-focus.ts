// src/commands/split-bottom-focus.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { splitBottomFocus } from "../lib/chains.js";

export default navCommand("split-bottom-focus", 'Split bottom, focus', splitBottomFocus);
