// src/commands/get-hold.ts — bunli verb for the closeOrRemove chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, closeOrRemove } from "../lib/chains.js";

export default navCommand("close-or-remove", 'Close or remove', closeOrRemove);
