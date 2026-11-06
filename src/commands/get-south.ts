// src/commands/get-south.ts — bunli verb for the getSouth chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getSouth } from "../lib/chains.js";

export default navCommand("get-south", '[$Mod-s] Zoom/peek grid (urgent jumpto, float branch)', getSouth);
