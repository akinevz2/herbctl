// src/commands/get-dedeck.ts — bunli verb for the getDedeck chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getDedeck } from "../lib/chains.js";

export default navCommand("get-dedeck", 'Count-gated mix', getDedeck);
