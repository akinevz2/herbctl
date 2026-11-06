// src/commands/get-rotate.ts — bunli verb for the rotateTree chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, rotateTree } from "../lib/chains.js";

export default navCommand("rotate-tree", '[$ModCtrl-r] Rotate the tree (<3 frames) or cycle', rotateTree);
