// src/commands/get-forward.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { getForward } from "../lib/chains.js";

export default navCommand("get-forward", 'Leave float layer', getForward);
