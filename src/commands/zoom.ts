// src/commands/get-zoom.ts — bunli verb for the zoomToggle chain
// (see src/lib/zoom.ts for the port and the source binding).
import { navCommand } from "../lib/chains.js";
import { zoomToggle } from "../lib/zoom.js";

export default navCommand("zoom", '[hc_zoom, $ModCtrl-f] Three-state toggle: float (frame fill) -> <tag>-max maximize -> restore', zoomToggle);
