// src/commands/get-bend.ts — bunli verb for the getBend chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getBend } from "../lib/chains.js";

export default navCommand("get-bend", '[$Mod-b] Focus the frame down, else split bottom at half and cycle into it', getBend);
