// src/commands/get-quiet.ts — bunli verb for the closeWindow chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, closeWindow } from "../lib/chains.js";

export default navCommand("close-window", '[$Mod-q] Un-float a float, else close/tidy', closeWindow);
