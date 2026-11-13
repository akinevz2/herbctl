// src/commands/xkill-or-close.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { xkillOrClose } from "../lib/chains.js";

export default navCommand("xkill-or-close", 'xkill or close', xkillOrClose);
