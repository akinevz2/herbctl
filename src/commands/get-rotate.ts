// src/commands/get-rotate.ts — bunli verb for the getRotate chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getRotate } from "../lib/chains.js";

export default navCommand("get-rotate", '[$ModCtrl-r] Rotate the tree (<3 frames) or cycle frames; single frame cycles windows +1', getRotate);
