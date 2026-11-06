// src/commands/get-below.ts — bunli verb for the splitDown chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, splitDown } from "../lib/chains.js";

export default navCommand("split-down", 'Split + shift down', splitDown);
