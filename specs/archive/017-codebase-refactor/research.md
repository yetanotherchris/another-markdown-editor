# Research: Codebase Refactor

Decisions and evidence for `017-codebase-refactor`, in the
`Decision / Rationale / Alternatives considered` format.

## R1 — Hook decomposition boundaries for App.tsx

**Decision**: Split `App.tsx` (1245 lines) into nine focused hooks under
`src/renderer/hooks/`, composed in dependency order by a thin App.tsx root
(~250 lines, SC-002). The split follows the claude document's handler-to-hook
map (items 1–8) and the grok document's responsibility table (suggestion 1).

**Rationale**: The claude document names the exact handlers that belong in each
hook (`useDocumentLifecycle`, `useExternalChangeHandling`, `useWorkspaceTree`,
`useDialogCoordination`, `useSourceViewToggle`, `useWorkspaceFolder`,
`useSidebarLayout`, `useMenuCommands`). The grok document names the same
responsibilities. Both identify the single largest orchestration module as the
primary maintainability risk (US1). Handler groups were verified against the
current App.tsx: each named handler already forms a cohesive cluster with no
cross-cluster flow except through `releaseDialogSurface` and the reducers.

**Alternatives considered**: (a) Zustand/Jotai global store — explicitly
rejected by the spec Assumption and suggestion 12; (b) splitting App.tsx into
sub-components instead of hooks — the handlers are imperative orchestration
over shared refs, not render logic, so hooks are the natural unit; (c) keeping
the split at "two or three big hooks" — under-delivers US1's acceptance that
each named responsibility lives in its own module.

## R2 — Shared state wiring between hooks

**Decision**: App.tsx owns the two `useReducer` dispatches, `sessionRef` and
`workspaceRef` (`sessionRef.current = session` per render), and the
`sidebarPanelRef`/`treeApiRef`/create refs. `useDialogQueue` owns
`dialogInFlightRef`, `pendingErrorRef`, `pendingExternalPromptRef` and the two
deferred-drain refs (`handleExternalChangeRef`, `showOperationErrorRef`); the
session/external hooks write their handlers into those refs exactly as the
current App.tsx does.

**Rationale**: The current `releaseDialogSurface` drains a deferred external
prompt by reading `handleExternalChangeRef.current` and a queued error by reading
`showOperationErrorRef.current`. Preserving this ref pattern verbatim keeps the
synchronous drain ordering (external notice first, then queued error) and the
single-prompt guard semantics — US3 scenario 2 requires this exact behaviour.
The refs are set on every render (`ref.current = fn`), so no stale closures.

**Alternatives considered**: (a) React context for shared refs — adds an
indirection with no behavioural benefit; (b) a single `useEngine` hook that
returns all nine hook groups — recreates the God module under a new name;
(c) passing callbacks as props between hooks — reorders or defers the drain,
risking US3's single-dialog-at-a-time rule.

## R3 — Pure decision extraction and the markdown accessor

**Decision**: `domain/dirty.ts` exports `getLiveContent`, `isDirtyLive`,
`getContentToSave`, `shouldFlushLive`, each taking the instance-pool markdown
accessor `(documentId: string) => string | null` as an injected parameter. The
hooks bind the real accessor (`(id) => instancePool.getMarkdown(id)`); tests
pass a fake.

**Rationale**: These are the decision rules the grok document (suggestion 2) and
the claude document (item 1) call out as the riskiest logic — live-dirty
detection, content-to-save, baseline policy. Making the pool access a parameter
keeps them pure (no module-level singleton import) so they run under Vitest
without React or Electron (US2 scenario 2, FR-011). The rules themselves are
copied verbatim — the raw-bytes policy (spec 002) and the 
`markdownSame`/`editorMatchesContent` semantics are not touched (US3).

**Alternatives considered**: (a) importing `instancePool` directly into the pure
module — couples the unit under test to the pool singleton and its Crepe
dependency; (b) keeping the functions in App.tsx and testing through e2e —
exactly what FR-003/US2 forbid.

## R4 — Reducer case-handler extraction

**Decision**: `state/documents.ts` and `state/workspace.ts` keep their `switch`,
but each case body becomes a named exported pure function
(`handleOpenNew(state)`, `handleOpenExisting(state, payload)`,
`handleUpdateContent(state, payload)`, …). The switch dispatches.

**Rationale**: FR-019 requires each case body to be short and independently
testable; the claude document (item 12) calls out the 481-line documents reducer
and 337-line workspace reducer as large switches. The reducers must stay the
source of truth (suggestion 5). Extracting per-action helpers in the same file
keeps reducer purity (React StrictMode double-invokes reducers; a side effect
would break) and lets each helper be unit-tested directly while the existing
`documentsReducer`/`workspaceReducer` tests pass unchanged.

**Alternatives considered**: (a) per-action reducer files in a folder —
fragments ownership and forces the helpers to reach across module boundaries for
`markdownSame`/`editorBaseline`; (b) leaving the switch as-is and only adding
tests — fails FR-019.

## R5 — Main-process handler split

**Decision**: `handlers.ts` splits into `src/main/ipc/handlers/{context,files,dialogs,workspace,settings,recent,app}.ts`.
`context.ts` holds `workspaceState`/`workspaceRoot`/`allowClose` plus the shared
helpers (`ok`, `err`, `sanitizeError`, `toAppError`, `ensureString`,
`validateKind`, `validateShape`, `withWorkspace`, `resolveAbsolutePath`) and the
spec-004 recent/fs helpers (`isRecentEntry`, `recordRecent`, `removeRecent`,
`canonicalPath`, `openFileFromPath`). Each domain module exports
`register*(window: BrowserWindow, ctx)`.

**Rationale**: The grok document (suggestion 3) proposes the exact layout
(`files.ts`, `dialogs.ts`, `workspace.ts`, `settings.ts`, `recentItems.ts`,
`app.ts`) and the claude document (item 17) requires separate registration
modules aggregated from `ipc/register.ts`. The public IPC surface must stay
identical (FR-005, SC-011) — the channels and their request/response types do
not change, only where the `ipcMain.handle` calls are written. Keeping the
shared helpers in one `context.ts` avoids re-implementing them per module (grok
suggestion 3: "Keep module-level helpers … in a small shared internal module").

**Alternatives considered**: (a) keeping one `handlers.ts` and only extracting
the helpers — fails FR-005's "each concern … implemented and registered in its
own module"; (b) a class-based service container — over-engineering; the module
state is two variables plus a flag, and a plain context module is the simplest
unit-testable form.

## R6 — Guardrail implementation without new dependencies

**Decision**: A single Node script `scripts/check-maintainability.mjs` using the
`typescript` compiler API (already a dependency): parse every `src/**/*.{ts,tsx}`
into a `Program`, then report (a) files over the size limits, (b) functions over
the cyclomatic-complexity limit, (c) circular imports via a graph over resolved
module specifiers, (d) exported symbols referenced by no other module. Wired as
`npm run check` (reporting; exit 0). 

**Rationale**: FR-012/FR-017/FR-018 need complexity, cycle, and unused-export
reporting, not just line counts. The `typescript` package already ships the
parser and type-checker the repo builds with; the script is ~150 lines and has
zero new dependencies (spec Assumption: "no new tooling is assumed beyond what
the plan selects"). Complexity is measured by counting decision points
(`IfStatement`, `ForOfStatement`, `ForStatement`, `WhileStatement`,
`DoStatement`, `SwitchCase`, `CatchClause`, `ConditionalExpression`,
`BinaryExpression &&/||`, `??`) per function, which is the McCabe-style guidance
the grok document suggests (suggestion 4).

**Alternatives considered**: (a) ESLint `complexity`/`max-lines` rules only —
catches files/functions but not cycles or unused exports; (b) `madge` + `knip`
+ `eslint-plugin-complexity` — three new dependencies; (c) a regex line-count
script — cannot measure complexity or detect cycles.

## R7 — Circular-dependency and dead-code detection

**Decision**: Cycle detection walks the resolved-import graph produced from the
compiler API and reports any strongly-connected component with >1 node
(simple DFS back-edge detection, grouped by file). Unused-export detection
collects all exported declarations from `src/**` and all imported identifiers
across `src/**` and `tests/**`, then reports exports never imported anywhere.
The preload API (`DesktopApi` consumed by the renderer) and any type re-exported
specifically for it are the only expected external surface.

**Rationale**: FR-018 requires zero cycles after the refactor and a check that
flags new cycles; FR-017 requires no unused imports/types/exports. Splitting
large modules creates both risks (US8). The spec's edge cases resolve ambiguity:
pre-existing cycles must be resolved as part of the refactor (not scoped away),
and the preload contract is the only external surface that legitimately keeps an
export alive.

**Alternatives considered**: (a) `noUnusedLocals`/`noUnusedParameters` only —
catches intra-file unused locals but not exported-but-unused symbols;
(b) TypeScript `references` — not applicable to a single-package build.

## R8 — Stylesheet split boundaries

**Decision**: `App.css` splits along the component boundaries identified in the
style inventory: `chrome.css` (header/chrome/hamburger: App.css lines 72–240),
`tabs.css` (tab bar: 297–419), `editor.css` (editor host + source view: 421–536),
`status.css` (footer: 547–618), `settings.css` (dialog: 620–732). `App.css`
keeps the global reset, design tokens, app shell, and panels (1–70, 242–295).
Each owning component imports its own stylesheet (Tree.tsx already imports
`./Tree.css`, the precedent). The font-override block (21–47) stays in
`App.css` (it keys off `.app-container[data-editor-font]`).

**Rationale**: FR-016 requires styles organised by area with each area's styles
co-located with its components; SC-008 caps every stylesheet at 400 lines. The
identified blocks are exactly contiguous ranges in App.css, so the split is a
mechanical move with no selector changes. US7 scenario 2 verifies no stylesheet
exceeds the cap.

**Alternatives considered**: (a) CSS Modules — a structural change to how every
component imports styles, beyond the refactor's mandate; (b) keeping App.css and
only adding new styles to per-area files — leaves the 732-line file in place,
failing SC-008.

## R9 — Test restructure boundaries

**Decision**: `tests/renderer/documents.test.ts` splits by its existing describe
clusters into four files (open/save/close; dirty; view; reroute) with shared
fixtures in `tests/renderer/helpers.ts`. The e2e harness in `tests/e2e/launch.ts`
gains `launchApp`, `stubOpenDialog`, `stubTrash`, `closeAppSafely`, `openFolder`,
`openFile`, `typeInEditor`, `pressShortcut`. `recent.spec.ts` splits into three
files by its banner groups (open, deleted/unavailable, persistence). Low-level
assertions duplicated in e2e are relocated to unit suites (IPC error-code
probes → `tests/main`, caret/clip-path/CSS-value pins stay e2e where they need
the real render).

**Rationale**: FR-009/FR-010 (split oversized suites, centralise helpers, don't
duplicate unit assertions) and the grok document suggestion 14 / claude document
item 23. The agent's analysis confirmed: all 9 e2e specs repeat the afterEach
teardown verbatim, 7 repeat the launch block, 5 duplicate `openFolder`, 4
duplicate `typeInEditor`, and `recent.spec.ts`'s IPC probes duplicate main-side
validation already unit-tested. Test restructuring may re-home/split but never
delete coverage (spec Assumption).

**Alternatives considered**: (a) Playwright project fixtures for shared state —
more idiomatic for e2e but a larger harness change and a new mental model for
the suite; explicit helpers in `launch.ts` preserve the existing structure;
(b) keeping `recent.spec.ts` intact — fails the US4 scenario-1 size-bound
acceptance.
