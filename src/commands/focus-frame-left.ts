// src/commands/get-advice.ts — bunli verb for the focusFrameLeft chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, focusFrameLeft } from "../lib/chains.js";

export default navCommand("focus-frame-left", 'Focus or split left', focusFrameLeft);
