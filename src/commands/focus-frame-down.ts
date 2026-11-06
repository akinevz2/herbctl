// src/commands/get-bend.ts — bunli verb for the focusFrameDown chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, focusFrameDown } from "../lib/chains.js";

export default navCommand("focus-frame-down", 'Focus or split down', focusFrameDown);
