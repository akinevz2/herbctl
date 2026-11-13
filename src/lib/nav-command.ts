// src/lib/nav-command.ts — the CLI verb factory shared by every
// src/commands/*.ts module: exit 1 when the underlying machine reports
// failure (run() returning false), 0 otherwise. The fail-soft contract
// ends here: a machine resolves false only when the whole keybind
// would have been a no-op.
//
// Lives apart from the chains so src/lib/chains.ts stays a pure
// herbstclient-chain module with no CLI-framework dependency.

import { defineCommand } from "@bunli/core";

export function navCommand(name: string, description: string, run: () => Promise<boolean | void>) {
    return defineCommand({
        name: name as never,
        description,
        handler: async () => {
            const ok = await run();
            if (ok === false) process.exit(1);
        },
    });
}
