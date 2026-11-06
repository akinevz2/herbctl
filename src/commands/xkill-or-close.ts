// src/commands/get-wrench.ts — bunli verb for the xkillOrClose chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, xkillOrClose } from "../lib/chains.js";

export default navCommand("xkill-or-close", 'xkill or close', xkillOrClose);
