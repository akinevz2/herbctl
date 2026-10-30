// src/commands/get-bendi.ts — bunli verb for the getBendi chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getBendi } from "../lib/chains.js";

export default navCommand("get-bendi", '[$ModCtrl-b] Split bottom at half and focus -i down', getBendi);
