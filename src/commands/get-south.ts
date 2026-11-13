// src/commands/get-south.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { getSouth } from "../lib/chains.js";

export default navCommand("get-south", 'Zoom/peek grid', getSouth);
