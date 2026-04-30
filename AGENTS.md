The role of this file is to describe common mistakes and
confusion points that agents might encounter as they work in
this project. If you ever encounter something in the project
that surprises you, please alert the developer working with you
and indicate that this is the case in the AgentMD file to help
prevent future agents from having the same issue.

If you have any question, ask, don't assume! If you are unsure about something, ask the developer working with you.
Simplify everything, don't create extra functions or components if they are not needed, don't overcomplicate things, keep it simple and straightforward. If you need to create a new function or component, ask to the dev working with you.
Don't touch any `*.po` file, they are auto generated. To update them, run `pnpm i18n:extract`.
Use `pnpm` to install dependencies and run scripts.
Use `isNimiqAsset` (not `isNimAsset`) as the naming convention when checking if the active asset is NIM.
In Vue templates, if multiple sibling blocks belong to the same currency, wrap them in a single `<template v-if="asset === Asset.USDT">` / `<template v-if="asset === Asset.NIM">` instead of repeating the asset condition on every block.
If implementing a new feature, check if there are existing components that can be reused before creating new ones.
if implementing a new feature or making big UI changes, check if there are existing tests, if not, add new tests to cover the new feature or changes. Use maestro for e2e tests. You can find them in `nimiq-pay-tests`.
Add comments to code that is complex or not immediately obvious; keep them concise and focused on explaining *why*, not *what*.
`Flow.vue` keeps previously visited steps mounted in `historyStack`. When wiring step event handlers (`done`, `select`, `skip`, `back`, or `navigateTo`), always validate that the emitting step is still the active step before changing flow state.
Always execute `pnpm lint` and `pnpm typecheck` after making changes to ensure code quality and type safety.
Never use `arr.forEach(async ...)`: the callback is fire-and-forget so awaits inside are not awaited by the loop. Use `for (const x of arr)` for sequential work or `await Promise.all(arr.map(async ...))` for parallel.
`Array.prototype.concat` returns a new array and does not mutate. If you intend to grow an existing local array (e.g. when accumulating categorized transactions), use `arr.push(...other)` instead — `arr.concat(other)` silently discards the result.
Nimiq client listeners (`client.addTransactionListener`, `client.addHeadChangedListener`) return a numeric ID and must be cleaned up via `client.removeListener` before re-registering. Anything registered inside a store action that can run more than once (e.g. on logout → login) must capture the ID and remove the previous one first; see the `watch(remoteAddress, ...)` block in `src/stores/sync.ts` for the canonical pattern.
On login/sync paths, hydrate UI state from the local DB cache (e.g. `useTransactions().refreshFromDb()`) before any network call. The user must never stare at an empty list while we wait for consensus when we already have the data on disk.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
