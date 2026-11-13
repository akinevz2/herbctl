// src/commands/get-dedeck.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { getDedeck } from "../lib/chains.js";

export default navCommand("get-dedeck", 'Count-gated mix', getDedeck);
