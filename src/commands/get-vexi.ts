// src/commands/get-vexi.ts — bunli verb for the getVexi chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getVexi } from "../lib/chains.js";

export default navCommand("get-vexi", '[$ModCtrl-v] Split right at half and focus -e right', getVexi);
