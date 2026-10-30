// src/commands/get-shuffle.ts — bunli verb for the getShuffle chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getShuffle } from "../lib/chains.js";

export default navCommand("get-shuffle", '[$ModShift-w] Shift window up / cycle -1 / cycle+rotate frames (the shift-up ladder)', getShuffle);
