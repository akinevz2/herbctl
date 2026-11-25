// src/commands/tag.ts — the focus-or-allocate tag shorthand
// (was: focus tag):
//
//   herbctl tag [name]
//
//   bare        enter the smallest free numeric tag (an
//               unallocated one is allocated — focus implies
//               allocation here)
//   [name]      an existing tag is entered; an unknown name is
//               allocated first
//   --free      the freeing counterpart (reparented from
//               `close tag`): free the named tag (default:
//               the focused one); with --empty, free EVERY empty
//               tag at once
//
// A tag IS an hlwm tag (create = `herbstclient add`, enter =
// `use`); the machines live in lib/allocate.js.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import {
    allocateTag,
    closeEmptyTags,
    freeTag,
} from "../lib/allocate.js";
import { argFailReason, promptValue } from "../lib/args.js";

export default defineCommand({
    name: "tag" as never,
    description: "tag [name] — enter, allocating when missing",
    options: {
        free: option(z.boolean().default(false), {
            description: "free the tag instead (default: the focused one)",
            short: "f",
            argumentKind: "flag" as const,
        }),
        empty: option(z.boolean().default(false), {
            description: "with --free: free EVERY empty tag at once",
            short: "e",
            argumentKind: "flag" as const,
        }),
    },
    handler: async ({ flags, positional }) => {
        if (flags.free) {
            if (flags.empty) {
                const closed = await closeEmptyTags();
                console.log(closed.length > 0
                    ? `closed the empty tags: ${closed.join(" ")}`
                    : "no empty tags to close");
                return;
            }
            const name = positional[0] ??
                await promptValue(
                    {
                        name: "name",
                        description: "the tag to free",
                        source: "tags",
                        blank: "current",
                        promptTitle: "tag to free",
                    },
                    "tag --free",
                );
            if (name === null) {
                console.error(argFailReason("name", "tag --free"));
                process.exit(2);
            }
            await freeTag(name);
            return;
        }
        const tag = await allocateTag(true, positional[0]);
        if (tag === null) process.exit(1);
    },
});
