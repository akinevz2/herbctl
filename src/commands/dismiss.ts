// src/commands/dismiss.ts — the notification dismissal, BARE
// (reparented from `close notification`; the close dispatch surface
// retired). The machine lives in lib/allocate.ts (fail-soft boolean).
import { navCommand } from "../lib/nav-command.js";
import { dismissNotifications } from "../lib/allocate.js";

export default navCommand("dismiss", "dismiss the notifications", dismissNotifications);
