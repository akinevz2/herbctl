// src/commands/close-or-remove.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { closeOrRemove } from "../lib/chains.js";

export default navCommand("close-or-remove", 'Close or remove', closeOrRemove);
