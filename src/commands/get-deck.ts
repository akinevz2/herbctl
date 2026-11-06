// src/commands/get-deck.ts — bunli verb for the getDeck chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getDeck } from "../lib/chains.js";

export default navCommand("get-deck", '[$Mod-d] Count-gated layout cycling', getDeck);
