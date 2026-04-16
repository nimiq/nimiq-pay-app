The role of this file is to describe common mistakes and
confusion points that agents might encounter as they work in
this project. If you ever encounter something in the project
that surprises you, please alert the developer working with you
and indicate that this is the case in the AgentMD file to help
prevent future agents from having the same issue.

Don't touch any `*.po` file, they are auto generated. To update them, run `pnpm i18n:extract`.
Use `pnpm` to install dependencies and run scripts.
Use `isNimiqAsset` (not `isNimAsset`) as the naming convention when checking if the active asset is NIM.
In Vue templates, if multiple sibling blocks belong to the same currency, wrap them in a single `<template v-if="asset === Asset.USDT">` / `<template v-if="asset === Asset.NIM">` instead of repeating the asset condition on every block.
If implementing a new feature, check if there are existing components that can be reused before creating new ones.
if implementing a new feature or making big UI changes, check if there are existing tests, if not, add new tests to cover the new feature or changes. Use maestro for e2e tests. You can find them in `nimiq-pay-tests`.
Add comments to code that is complex or not immediately obvious; keep them concise and focused on explaining *why*, not *what*.
`Flow.vue` keeps previously visited steps mounted in `historyStack`. When wiring step event handlers (`done`, `select`, `skip`, `back`, or `navigateTo`), always validate that the emitting step is still the active step before changing flow state.
Always execute `pnpm lint` and `pnpm typecheck` after making changes to ensure code quality and type safety.
