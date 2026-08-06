# Implementation Plan: Codebase Refactor

**Branch**: `017-codebase-refactor` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-codebase-refactor/spec.md`, driven by
the two reference assets `specs/017-codebase-refactor/assets/grok-another-markdown-editor-maintainability-suggestions.md`
(17 suggestions) and `specs/017-codebase-refactor/assets/claude-suggested-changes.md`
(27 suggestions).

## Summary

A **purely structural refactor** of the renderer orchestration, the main-process
IPC layer, the state reducers, the stylesheets, and the test suites. No
user-visible behaviour changes, no new features, no bug fixes. Behavioural
equivalence is the requirement (FR-007, FR-008): the existing unit suite (307
tests) and the e2e suite must pass identically after the change, except where a
test is intentionally restructured to mirror production layout (US4).

The highest-leverage change is splitting the two largest orchestration modules:

- `src/renderer/App.tsx` (1245 lines) — a God component owning document session,
  workspace tree, dialog queuing, external-change handling, menu routing,
  source↔formatted transitions, and sidebar layout. Reduced to a thin
  composition root (~250 lines, SC-002) by extracting nine focused hooks under
  `src/renderer/hooks/`, each with a single responsibility.
- `src/main/ipc/handlers.ts` (696 lines) — 21 `ipcMain.handle` registrations for
  files, dialogs, workspace, settings, recent items, and app lifecycle in one
  module. Split by domain into `src/main/ipc/handlers/*.ts`, each exporting a
  `register*(window, ctx)` function, aggregated by `src/main/ipc/register.ts`
  (FR-005). The public IPC surface and preload contract are unchanged
  (FR-021, SC-011).

Supporting structural work: pure decision functions extracted out of renderer
callbacks (FR-003/US2), reducer case bodies extracted into per-action helper
functions (FR-019), `nativeDialog.messagesFor` converted from a long chain to a
lookup map (FR-020), the explorer tree thinned (drag/drop + rename handled in
their own units), `App.css` split by area (FR-016), and a set of automated
maintainability guardrails (size/complexity limits, circular-dependency check,
dead-code check — US5/US8) plus a domain-policy index (US6/FR-013).

## Technical Context

**Language/Version**: TypeScript 5.8, `strict: true`, across main, preload and
renderer. No new runtime or dev dependencies — the guardrails reuse the already-
present `typescript` compiler API and the existing Vitest/ESLint toolchain
(spec Assumptions: dead-code detection uses existing tooling; no new tooling is
assumed beyond what the plan selects).

**Primary Dependencies**: None added. The refactor reuses React 19 custom hooks,
`react-resizable-panels` (`usePanelRef`), `react-arborist` (`TreeApi`), and the
existing `@milkdown/crepe` instance pool. No global state-management library is
introduced (spec Assumption: dedicated focused modules first; a store is only
considered if module composition proves inadequate — it is not expected to).

**Storage**: Unchanged. `config.json` (settings + recent items) and workspace
file handling are untouched by this feature.

**Testing**: Vitest 4 (node for `tests/main`, jsdom for `tests/renderer`);
Playwright e2e via `npm run test:e2e`. The refactor adds: unit tests for every
extracted pure decision function (FR-011), unit tests for the reducer
case-handler extraction and the `messagesFor` lookup map (existing suites are
extended, not replaced), and restructured test files that mirror production
layout (US4). Existing tests are moved or split, never deleted (spec Assumption).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: No change to the keystroke path; hooks are wired once at
mount. The guardrails run in CI/`npm run check`, never at runtime.

**Constraints**: Renderer sandboxed (no Node/`fs`/Electron); all disk I/O in
main. The preload API surface is a fixed list of named operations — unchanged.
Every path is validated in main against the workspace root. Saves remain atomic
and dirty-state semantics are untouched (Principle III). No user-visible
behaviour change (FR-007).

**Scale/Scope**: ~7,300 lines of `src/` (of which App.tsx is 1245 and handlers.ts
is 696) and ~6,600 lines of `tests/`. Out of scope: any behaviour change, new
feature, or bug fix; the editor-rendering boundary (`CrepeHost`, `instancePool`)
and the central contract types (`ipc-contract.ts`) are fixed surfaces (spec
Assumption).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | The renderer keeps zero Node/`fs`/Electron access; every new renderer module speaks only through the existing `window.api` named operations. No new IPC channel, no generic `invoke`. The main split keeps every handler behind the same named operations. The preload surface is audited, not changed | **PASS** |
| II. Every Path Is Untrusted | Path validation stays in `src/main/fs/*` and the handler layer; no renderer hook validates paths (renderer checks remain convenience only). `scrubAbsolutePaths` remains the single scrub point called from the sanitise helpers — the refactor only relocates the callers | **PASS** |
| III. Never Lose The User's Words | Saves stay atomic, failed saves stay dirty, dirty-state semantics (live-dirty, baseline, content-to-save, single-prompt guard) are extracted verbatim into pure functions and hooks — no decision rule is changed while relocating (US3). The guardrail never touches data paths | **PASS** |
| IV. Calm, Predictable Editing | No behaviour, timing, or focus change. The dialog queue, debounced live-dirty detection, and pool eviction behave exactly as before; e2e suites are the regression net | **PASS** |
| V. Test What Can Corrupt Or Escape | Every extracted decision function ships with direct unit tests covering its branches (FR-011); path-containment, atomic-write, and process-isolation tests remain green and unweakened (FR-015); the guardrails catch size/complexity/cycle/unused-export regressions | **PASS** |

## Phase 1 Design decisions

**Renderer hooks (`src/renderer/hooks/`)** — App.tsx (1245 lines) splits into
nine hooks plus a thin composition root. Each hook owns a named responsibility
(FR-001/FR-002). Shared state is passed explicitly: App.tsx owns the two
`useReducer`s and their refs (`sessionRef`, `workspaceRef`); `useDialogQueue`
owns the single-prompt guard and the pending queues and exposes refs so the
session/external hooks can register the deferred-drain callbacks — exactly the
ref-update pattern the current `releaseDialogSurface` uses.

| Hook | Responsibility (handlers moved) |
|------|--------------------------------|
| `useDialogQueue` | `dialogInFlightRef`, `pendingErrorRef`, `pendingExternalPromptRef`, `releaseDialogSurface`, `showOperationError` (spec 008 single-prompt guard) |
| `useDocumentSession` | `saveDocument`, `doClose`, `handleCloseRequest`, `reloadDocument`, `handleQuitRequest`, `flushLiveContent`, `enforcePoolCap`, `handleContentChange`, `handleBaselineCapture`, `handleCursorState`, `handleActivate`, `handleNew`, `handleOpen`/`openPathInFormatted` |
| `useSourceViewToggle` | `handleShowSource`, `handleReturnToFormatted`, `openPathInSource`, `handleViewSource` (spec 002) |
| `useWorkspaceTree` | `handleTreeSelect`, `handleTreeActivate`, `handleTreeToggle`, `applyMove`, `handleRename`, `handleEditingCancelled`, `handleCreate`, `cleanupAfterDelete`, `runDeleteConfirmation`, `handleTreeMove` |
| `useExternalFileEvents` | `handleExternalPrompt`, `handleExternalChange` (registers itself into the dialog queue's deferred-drain ref) |
| `useMenuCommands` | `handleMenuCommand` (routes `MenuCommand` → session/workspace/folder actions) |
| `useWorkspaceFolder` | `commitFolderOpen`, `runFolderOpenFlow`, `dirtyWorkspaceRelativeDocs`, `revealExplorer` (spec 004 two-phase open) |
| `useSidebarLayout` | `handleSidebarResize`, `handleToggleExplorer` (spec 010 visibility + persistence) |
| `useEditorPool` | LRU cap enforcement + clean-only eviction (`instancePool`, `EVICT`/`REACTIVATE`) |

Hooks are wired in dependency order inside App.tsx; `sessionRef`/`workspaceRef`
are created there and passed to the hooks that need them. The dialog queue's
deferred-drain refs (`handleExternalChangeRef`, `showOperationErrorRef`) keep the
current synchronous drain semantics.

**Pure domain functions (`src/renderer/domain/`)** — FR-003: decision rules that
currently live inside App.tsx callbacks move to pure, electron-free, React-free
modules so they are directly unit-testable without the application:

- `domain/dirty.ts`: `getLiveContent(doc, getMarkdown)`, `isDirtyLive(doc,
  getMarkdown)`, `getContentToSave(doc, getMarkdown)`, `shouldFlushLive(doc,
  getMarkdown)` — each takes the instance-pool markdown accessor as an injected
  dependency so it stays pure (raw-bytes policy, spec 002, preserved verbatim).
- `domain/quit.ts`: `planQuit`-style decision helpers and the save-result loop
  sub-steps (`shouldRePromptForFailedSave`, `dirtyDocumentsToSave`) — the pure
  cores of the quit/close/folder-open save loops.
- `explorer/operations.ts` (extended): `isWorkspaceRelative` moves here from
  App.tsx; path/entry helpers stay co-located (US1 scenario 4).

**Reducer case-handler extraction (FR-019)** — `state/documents.ts` (481 lines)
and `state/workspace.ts` (337 lines) keep their `switch` dispatch but each
`case` body moves into a named pure helper (`handleOpenNew(state, action)`,
`handleUpdateContent(state, action)`, …) called from the switch. Case bodies stay
short and independently testable; the reducer remains the source of truth
(suggestion 5) and the existing pure reducer tests pass unchanged.

**Main-process handler split (FR-005)** — `handlers.ts` (696 lines) splits into
`src/main/ipc/handlers/*.ts`. A shared `context.ts` holds the module state
(`workspaceState`, `workspaceRoot`, `allowClose`) and the shared helpers
(`ok`/`err`/`sanitizeError`/`toAppError`/`ensureString`/`validateKind`/
`validateShape`/`withWorkspace`/`resolveAbsolutePath`, plus the spec-004 recent
helpers and `openFileFromPath`), so no handler module re-implements them. Each
domain module exports `register*(window, ctx)`:

| Module | Channels |
|--------|----------|
| `handlers/files.ts` | `file:openDialog`, `file:read`, `file:write`, `file:saveDialog` |
| `handlers/dialogs.ts` | `dialog:show` |
| `handlers/workspace.ts` | `workspace:prepareFolderOpen`, `workspace:commitFolderOpen`, `workspace:cancelFolderOpen`, `workspace:readDir` |
| `handlers/settings.ts` | `settings:get`, `settings:update` |
| `handlers/recent.ts` | `recent:openFile`, `recent:list`, `recent:clear` |
| `handlers/app.ts` | `app:requestQuit`, `devtools:toggle`, `quit:respond`, window-close guard |
| `register.ts` | aggregation (already exists, extended to call each `register*`) |

The preload contract (`DesktopApi`, `src/preload/index.ts`) is audited and left
structurally unchanged (FR-021); the existing IPC contract tests
(`tests/main/ipc.test.ts`) pin its shape (SC-011).

**`nativeDialog.messagesFor` lookup map (FR-020)** — `src/shared/nativeDialog.ts`
(300 lines) converts the long per-kind `if/else` chain producing
`{type,message,detail}` into a `Record<NativeDialogRequest['kind'], (req) => …>`
lookup map, keyed by the discriminating field. The layout tables and
`decisionFromResponse` are untouched; the existing `nativeDialog.test.ts` pins
every kind × platform.

**Explorer tree thinning** — `explorer/Tree.tsx` (499 lines) keeps rendering and
arborist wiring; the drag/drop target computation and the inline-rename
start/cancel flow move into focused modules (`explorer/treeMove.ts` +
`explorer/treeRename.ts`), each unit-testable. `App.tsx`'s CRUD orchestration
already lives in `explorer/operations.ts` — unchanged.

**Stylesheet split (FR-016, US7)** — `App.css` (732 lines) splits by area, with
each area co-located with the components it styles (the explorer already imports
its own `Tree.css`, setting the precedent): `chrome.css` (header/chrome/hamburger),
`tabs.css`, `editor.css` (editor host + source view), `status.css`, `settings.css`;
`App.css` keeps the global reset, design tokens, app shell, and panels. Each
component imports its own stylesheet; no stylesheet exceeds 400 lines (SC-008).

**Test restructure (US4, FR-009/FR-010)** — mirrors production layout:
- `tests/renderer/documents.test.ts` (747 lines) splits by concern:
  `documents.open-save-close.test.ts`, `documents.dirty.test.ts`,
  `documents.view.test.ts`, `documents.reroute.test.ts`; shared `createSession`/
  `openTwoFiles` fixtures move to `tests/renderer/helpers.ts`.
- `tests/renderer/domain/` added for the extracted pure functions (`dirty.test.ts`,
  `quit.test.ts`) and the tree move/rename units.
- e2e shared harness expanded in `tests/e2e/launch.ts`: `launchApp(configDir)`,
  `stubOpenDialog(folder)`, `stubTrash()`, `closeAppSafely(app)`, `openFolder`,
  `openFile`, `typeInEditor`, `pressShortcut` — replacing the near-identical
  per-spec copies (7 specs repeat the launch block; all 9 repeat the afterEach).
- Oversized e2e specs are split by user story with `describe` blocks added
  (the banner comments already define the boundaries): `recent.spec.ts` (774
  lines) → `recent.open.spec.ts`, `recent.deleted.spec.ts`,
  `recent.persistence.spec.ts`; other large specs (`organize`, `tabs`) get
  `describe` blocks and delegate to the shared helpers without splitting into
  new files unless the size bound demands it.
- Low-level assertions that duplicated unit tests are relocated: IPC error-code
  probes from `recent.spec.ts` (lines 549–563, 399–403) move to `tests/main`
  unit tests; the ellipsis assertion is already covered by `shortenPath.test.ts`.
  Application-level suites stop duplicating low-level unit rules (FR-010).

**Automated guardrails (US5/US8, FR-012/FR-017/FR-018)** — a single Node script
`scripts/check-maintainability.mjs` using the TypeScript compiler API (no new
dependency):

- **Size**: any `src/**/*.{ts,tsx}` over 500 lines (SC-001); any stylesheet
  over 400 lines (SC-008); the orchestration modules (hooks, App.tsx) over 300.
- **Complexity**: any function over the agreed cyclomatic limit (15), reported
  with its location.
- **Circular imports**: a build of the import graph across `src/**/*.{ts,tsx}`
  reports any cycle (FR-018, SC-009).
- **Unused exports**: exported symbols (types, functions, constants) referenced
  by no other module in `src/` or `tests/` are reported (FR-017, SC-010) — the
  preload API is the only external surface, so anything else unreferenced is
  dead.
- `npm run check` runs the guardrail as a **reporting** check (spec Assumption:
  reporting first; escalation to block merges is a later decision). The
  maintainability limits follow the tighter bound where the two suggestion
  documents differ (spec Assumption).

**Domain-policy index (US6/FR-013)** — `docs/domain-policies.md` lists each
non-negotiable domain policy (raw-bytes handling, live-dirty detection,
clean-only eviction, single dialog at a time, two-phase folder open, path
scrubbing, atomic saves) and points at where each is enforced in the refactored
code, cross-referencing the constitution and relevant specs. Documentation
references to moved modules are updated in the same change (FR-014).

## Project Structure

### Documentation (this feature)

```text
specs/017-codebase-refactor/
├── spec.md              # Requirements (US1–US8, FR-001…FR-022)
├── plan.md              # This file
├── research.md          # R1…R9 evidence (hook wiring, handler split, guardrails)
├── data-model.md        # Module/responsibility map + hook + reducer + guardrail shapes
├── quickstart.md        # Validation script (full four-command gate + guardrail)
├── contracts/
│   ├── renderer.md      # Hook responsibilities + pure function contracts + test layout
│   ├── main.md          # Handler module map + registration contract + shared ctx
│   └── guardrails.md    # Size/complexity/cycle/unused-export limits + check contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/main/ipc/
├── register.ts              # MODIFY: aggregate register*(window, ctx) calls
├── dialogValidation.ts      # UNCHANGED (electron-free, unit-tested)
├── handlers/                # NEW (from handlers.ts, FR-005)
│   ├── context.ts           # shared workspace state + ok/err/sanitize + recent/fs helpers
│   ├── files.ts             # file:* channels
│   ├── dialogs.ts           # dialog:show
│   ├── workspace.ts         # workspace:* channels
│   ├── settings.ts          # settings:* channels
│   ├── recent.ts            # recent:* channels
│   └── app.ts               # quit/devtools/window-close channels
└── handlers.ts              # DELETED (split into handlers/)

src/renderer/
├── App.tsx                  # MODIFY: thin composition root (~250 lines)
├── App.css                  # MODIFY: shell + base only
├── chrome/chrome.css        # NEW (chrome + hamburger styles)
├── tabs/tabs.css            # NEW (tab bar styles)
├── editor/editor.css        # NEW (editor host + source view styles)
├── status/status.css        # NEW (footer styles)
├── chrome/settings.css      # NEW (settings dialog styles)
├── hooks/                   # NEW (nine focused hooks, see above)
│   ├── useDialogQueue.ts
│   ├── useDocumentSession.ts
│   ├── useSourceViewToggle.ts
│   ├── useWorkspaceTree.ts
│   ├── useExternalFileEvents.ts
│   ├── useMenuCommands.ts
│   ├── useWorkspaceFolder.ts
│   ├── useSidebarLayout.ts
│   └── useEditorPool.ts
├── domain/                  # NEW (pure, testable decision functions)
│   ├── dirty.ts
│   └── quit.ts
├── state/documents.ts       # MODIFY: per-action-case helper functions (FR-019)
├── state/workspace.ts       # MODIFY: per-action-case helper functions (FR-019)
├── explorer/operations.ts   # MODIFY: + isWorkspaceRelative
├── explorer/treeMove.ts     # NEW (drag/drop target logic)
├── explorer/treeRename.ts   # NEW (inline rename start/cancel logic)
├── explorer/Tree.tsx        # MODIFY: thin render/wiring layer
└── shared/nativeDialog.ts   # MODIFY: messagesFor → lookup map (FR-020)

docs/domain-policies.md      # NEW (US6/FR-013)
scripts/check-maintainability.mjs  # NEW (US5/US8 guardrail, npm run check)
package.json                 # MODIFY: + "check": "node scripts/check-maintainability.mjs"
```

```text
tests/
├── renderer/
│   ├── helpers.ts                   # NEW (createSession, openTwoFiles, fixtures)
│   ├── documents.open-save-close.test.ts  # from documents.test.ts
│   ├── documents.dirty.test.ts            # from documents.test.ts
│   ├── documents.view.test.ts             # from documents.test.ts
│   ├── documents.reroute.test.ts          # from documents.test.ts
│   ├── domain/dirty.test.ts         # NEW (extracted pure functions)
│   ├── domain/quit.test.ts          # NEW
│   ├── treeMove.test.ts             # NEW
│   ├── treeRename.test.ts           # NEW
│   └── (existing suites unchanged)
├── main/
│   ├── ipc.test.ts                 # UNCHANGED (contract shape, SC-011)
│   └── (existing suites unchanged)
└── e2e/
    ├── launch.ts                   # MODIFY: shared harness (launchApp, stubOpenDialog, …)
    ├── recent.open.spec.ts         # from recent.spec.ts
    ├── recent.deleted.spec.ts      # from recent.spec.ts
    ├── recent.persistence.spec.ts  # from recent.spec.ts
    └── (other specs use shared helpers; describe blocks added)
```

**Structure decision**: production modules are grouped by concern — `hooks/` for
orchestration, `domain/` for pure decision logic, `ipc/handlers/` for main-process
channels, per-area stylesheets co-located with components. Tests mirror
production layout exactly (US4 scenario 1) with shared helpers centralised
(US4 scenario 3). `state/` remains the reducer source of truth (suggestion 5).

## Phase status

- Phase 1: Setup — green baseline on `017-codebase-refactor` (created from clean
  `main` per AGENTS.md): `npm run lint`, `npm run typecheck`, `npm run test`
  (307 passing), e2e suite confirmed.
- Phase 2: Foundational — `docs/domain-policies.md`, the pure domain functions
  (`domain/dirty.ts`, `domain/quit.ts`) with unit tests, `isWorkspaceRelative`
  relocation, the reducer case-handler extraction (FR-019), the `messagesFor`
  lookup map (FR-020), and the guardrail script skeleton.
- Phase 3: US1 — the App.tsx hook split (nine hooks + thin composition root) and
  the main-process handler split (FR-001/002/005). Behaviour preserved by the
  existing suites.
- Phase 4: US2 — remaining decision-flow decomposition (folder-open,
  quit-with-dirty, delete-confirmation into named sub-steps) + their unit tests.
- Phase 5: US3 — full behavioural-equivalence gate: the entire pre-existing
  suite passes unchanged.
- Phase 6: US4 — test restructure (documents.test.ts split, domain tests, e2e
  shared harness, e2e spec splits + describe blocks, low-level assertions
  relocated).
- Phase 7: US5 + US8 — guardrails enforced and green (size/complexity/cycle/
  unused exports) on the refactored codebase.
- Phase 8: US7 — stylesheet split.
- Phase 9: Polish — reference updates (FR-014), quickstart pass, final
  four-command gate + `npm run check`, spec archive.

## Deferred / later features

- Escalating the guardrail from a reporting check to a merge-blocking CI gate
  (spec Assumption: a later decision, not assumed here).
- Any behaviour change, new feature, or bug fix (spec Assumption: purely
  structural).
- A global client-state store (spec Assumption: only if module composition
  proves inadequate — it is not expected to).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Nine hooks + a shared-refs wiring pattern in App.tsx (vs. a global store) | The hooks must share the two reducers, `sessionRef`/`workspaceRef`, and the single-dialog guard. Explicit ref-passing preserves the exact current semantics with no behavioural risk; it also keeps the ref sync (`sessionRef.current = session`) in one visible place | Introducing Zustand/Jotai (spec Assumption explicitly prefers dedicated modules first; a store would rewrite the state flow and risk behavioural drift) |
| The dialog queue owns refs (`handleExternalChangeRef`, `showOperationErrorRef`) that other hooks write into | `releaseDialogSurface` must drain a deferred external notice or queued error synchronously, exactly as today; the current code already uses this ref pattern to break the render-cycle dependency between `handleExternalChange` and `releaseDialogSurface` | Passing callbacks as props would reorder the drain semantics or force a context/effect indirection that changes timing (US3 scenario 2 forbids this) |
| Guardrail script uses the TypeScript compiler API (heavier than a line-count script) | FR-012/FR-017/FR-018 need complexity, cycle detection, and unused-export reporting, not just LOC. `typescript` is already a dependency, so no new tooling is added | A pure regex line-count script (cannot measure complexity or detect cycles); adding `madge`/`knip` (new dependencies, spec Assumption prefers existing tooling) |
| Reducer switch case bodies become thin dispatchers to helper functions in the same file | Keeps the reducer as the source of truth while making each case body short and independently testable (FR-019) | Splitting the reducer into many files (fragments the state logic the reducer must own wholesale; the case helpers share `markdownSame`/`editorBaseline` semantics) |

## Decision log

### 2026-08-06

- **Branch** is `017-codebase-refactor` (per `setup-plan.ps1` BRANCH output and
  the archived spec convention `###-feature-name`). The stale
  `spec-017-codebase-refactor` branch (spec-only, already merged as #28) is not
  used.
- **Hook set** follows the tighter union of the two suggestion documents:
  the grok document's nine-hook table and the claude document's
  `use*` list agree on responsibilities; `useSourceViewToggle` and
  `useWorkspaceFolder` are kept as separate hooks per the claude document.
- **Guardrail scope**: size/complexity/cycle/unused-export limits are taken from
  the spec Success Criteria (500 source / 300 orchestration / 400 stylesheet /
  cyclomatic 15), which is the tighter bound where the two documents differ.
- **Refactor order** follows the grok document's suggested order of work:
  pure helpers first (testable, low-risk), then hooks, then the main handler
  split, then tests, then guardrails, then CSS/docs.
- **No `describe` blocks invented where the banner-comment grouping is the only
  structure**: e2e specs get `describe` blocks matching their existing banner
  comments (the agent's finding); tests are re-homed, never deleted.
- **`getWorkspaceState`/`getWorkspaceRoot`** (handlers.ts exports) are unused
  outside handlers.ts; they move to `context.ts` and are dropped from the public
  surface of `register.ts`.
- **Renderer-only vs shared types**: no main-only or renderer-only type moves
  into `src/shared/` during this refactor (FR-022); the `shared/` surface is
  unchanged apart from the internal `messagesFor` map in `nativeDialog.ts`.

### Post-implementation (recorded 2026-08-06, before archive)

The implementation PR completed all ten phases. Recorded deviations and
decisions that differed from the plan as written:

- **`handleOpen`/`openPathInFormatted` live in `useSourceViewToggle`**, not
  `useDocumentSession` (data-model §1.1 step 2). The claude document puts
  `openPathInFormatted` in the source-view hook; the session hook has no clean
  reference to it without a render-cycle dependency. `handleOpen` is a thin
  wrapper there. The task list (T014/T015) described the same split.
- **`entry:*` channels moved to `handlers/files.ts`** rather than a separate
  `entries.ts` — the grok layout's `files.ts` ("read / write / open dialogs")
  and the plan's module map only listed six modules; the entry mutations are
  file operations, so they co-locate with `file:*`.
- **The `shouldFlushLive` domain function became the flush decision** in
  `useDocumentSession.flushLiveContent` (the plan's R3 described a
  `shouldFlushLive` decision; it is consumed exactly there).
- **`npm run check` is green with zero violations** after Phase 8 (SC-006);
  the complexity reductions (resolveWithinRoot, normalizeRecentItems,
  applyWatchEvent) extracted pure helpers with identical control flow rather
  than recording exceptions, which the constitution prefers.
- **`src/shared/errors.ts` was deleted** (FR-017): its two exports
  (`isErrorCode`, `AppError`) were unused anywhere; `toAppError` in
  `handlers/context.ts` is the surviving error mapper.
- **E2E describe blocks use `test.describe(...)`** (not a top-level `describe`
  import): this Playwright version types `describe` only as a property of
  `test`.
- **Final gate** (recorded at archive): `npm run lint` clean, `npm run typecheck`
  clean, `npm run check` — no violations, `npm run test` 355/355 (33 files),
  `npm run test:e2e` 119/119. The single pre-existing e2e flake
  (`source.spec.ts` US5 task-backspace) passed on the final run.
- **`docs/codingstandards.md`** was amended during the refactor (by the
  maintainer) to frame shape metrics as signals-not-gates; the spec's SC-001/
  SC-006/SC-008 limits remain binding acceptance criteria for this feature,
  while the guardrail remains a reporting check per the spec Assumption.
