# rigor

## pairs
- float-focus <-> float-yank: extracted.ts
- setAttr <-> attr/read: hc.ts
- lock/unlock <-> state-write: imperatives.ts, extracted.ts
## invariants
- a write must be verified at the read (e.g., floating_focused).
## findings
- [x] R2 | extracted.ts:137-141 | timing window: frameCc read may be stale (80ms delay) | guard: test (tests/rigor/source-guards.test.ts — settle re-read pinned: passing + failing sample both proven)
- [x] R9 | extracted.ts:244-253 | hasMinimizedClients ignores missing minimized props | guard: test (missing-attr scenario -> false, no crash)
- [x] R10 | all src/lib | catch-all null dereference risk on fail-soft reads | guard: test (bare `hc(...).stdout` dereference = 0 across 12 lib files; fails on injected sample)
- [ ] R1 | extracted.ts:127-130 | switch write resolves null on failure; success path uses pre-scanned firstFloat | guard: covered by existing machines.test.ts cases
- [ ] R3 | extracted.ts:110,125,189 | multiple idempotent register writes race by design (documented) | guard: covered by machines.test.ts
- [ ] R4 | extracted.ts:142-148 | jumpto may focus stale wid if state shifted | guard: covered by machines.test.ts
- [ ] R5 | hc.ts:95-99 | setAttr returns boolean, no read-back verification | guard: covered by chains.test.ts
- [ ] R6 | imperatives.ts:60-62 | minimizeKeepFrame no state verification | guard: covered by chains.test.ts:449
- [ ] R7 | extracted.ts:74-77,241-242 | tagTotal falls back "0" on unreadable tag | guard: covered by machines.test.ts:429+
- [ ] R8 | tests/verbs.test.ts:165-173 | corner guard read pinned, post-write state not re-asserted | guard: covered by verbs.test.ts
## waived