// src/commands/get-deck.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { getDeck } from "../lib/chains.js";

export default navCommand("get-deck", 'Count-gated cycling', getDeck);
