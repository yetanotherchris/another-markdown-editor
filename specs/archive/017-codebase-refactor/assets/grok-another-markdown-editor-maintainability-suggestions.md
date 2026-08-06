# Maintainability suggestions for another-markdown-editor

**Repo:** https://github.com/yetanotherchris/another-markdown-editor  
**Scope:** Entire `src/` tree and `tests/`  
**Focus:** Maintainability (structure, complexity, cohesion, testability)  
**Context:** Feedback aligned with classic code-quality metrics (KLOC, cyclomatic complexity, cohesion/LCOM-style concerns) and practical TypeScript / React / Electron experience. Written with a C# engineer's lens on a TS codebase.

---

## Summary

The project is thoughtfully engineered: typed IPC, domain-aware document handling (raw bytes vs Crepe normalization), editor instance pooling, external-change prompts, path scrubbing, two-phase folder open, and strong unit + e2e coverage with spec/US references. That is a solid foundation.

The main maintainability risks are **concentration of orchestration** in a few large modules and **test files that mirror that size**. Addressing those will keep the behavioural quality while making change cheaper and safer.

| Hotspot | Approx. size | Primary issue |
|---------|----------------|---------------|
| `src/renderer/App.tsx` | ~51 KB | God component / orchestration |
| `tests/e2e/recent.spec.ts` | ~33 KB | Very large e2e suite |
| `tests/renderer/documents.test.ts` | ~30 KB | Large but focused unit suite |
| `src/main/ipc/handlers.ts` | ~28 KB | Concentrated IPC + FS + workspace |
| `tests/e2e/organize.spec.ts` | ~21 KB | Large e2e suite |
| `src/renderer/explorer/Tree.tsx` | ~17 KB | Large UI + behaviour |
| `src/renderer/state/documents.ts` | ~16 KB | Acceptable; watch growth |
| `src/renderer/App.css` | ~14 KB | Style volume (secondary) |
| `tests/e2e/source.spec.ts` / `tabs.spec.ts` / `native.spec.ts` / `chrome.spec.ts` | 12–16 KB each | e2e size / shared setup opportunity |

---

## Numbered suggestions

### 1. Split `App.tsx` into focused custom hooks (highest impact — renderer)

**Problem:** `App.tsx` owns document session, workspace tree, settings, save/close/quit, live-dirty detection, editor pool eviction, external change handling, dialog queuing, source↔formatted transitions, tree CRUD, and menu routing (~1,200 lines).

**Extract into hooks** (e.g. under `src/renderer/hooks/`):

| Hook | Responsibility |
|------|----------------|
| `useDocumentSession()` | Open / close / save / reload, dirty & live-content checks, baseline, content-to-save |
| `useWorkspaceTree()` | Expand / select / open / create / rename / delete / move; tree API ref |
| `useDialogQueue()` | Single-prompt guard, pending error / external queues, `releaseDialogSurface` |
| `useExternalFileEvents()` | Changed / removed routing, auto-reload vs prompt |
| `useMenuCommands()` | Map `MenuCommand` → session / workspace actions |
| `useEditorPool()` | Cap enforcement, LRU eviction of clean docs |
| `useExplorerCollapse()` | Sidebar visibility + persistence (spec 010) |

**Target:** `App.tsx` as thin composition root (~200–300 lines): layout + wiring only.

---

### 2. Extract pure domain functions from renderer orchestration

Move decision trees out of React callbacks into testable modules (e.g. `src/renderer/domain/` or next to existing state helpers).

**Candidates:**

- Close / quit decision helpers (extend `planClose`)
- `isDirtyLive(doc, getLiveMarkdown)` — `editorBaseline` + raw-bytes policy
- `getContentToSave(doc, getLiveMarkdown)` — source vs dirty formatted vs pristine
- Save-result loops (unsaved-close, unsaved-quit, external-removed)
- Path / entry helpers (extend `explorer/operations.ts`)

**Why:** Lowers cyclomatic complexity in UI code; enables pure Vitest coverage without Electron or React.

---

### 3. Split main-process IPC handlers by concern

`src/main/ipc/handlers.ts` (~28 KB) registers and implements file IO, dialogs, workspace prepare/commit, settings, recent items, watching, and window-close policy in one place.

**Suggested layout:**

```
src/main/ipc/
  handlers/
    files.ts          # read / write / open dialogs
    dialogs.ts        # native confirmation wiring
    workspace.ts      # prepareFolderOpen / commit / close / watch
    settings.ts
    recentItems.ts    # record / remove / open recent
    app.ts            # quit, window close guard
  register.ts         # existing thin registration
  dialogValidation.ts # keep (already electron-free)
```

Keep module-level helpers (`ok` / `err` / `sanitizeError` / `withWorkspace`) in a small shared internal module. Preserve the public IPC surface and preload contract.

---

### 4. Soft LOC and complexity limits across `src`

| Kind of file | Soft LOC limit | Notes |
|--------------|----------------|--------|
| React component (`.tsx`) | ~300–400 | Orchestrators thinner |
| Pure module / reducer | ~400–500 | Split when a second concern appears |
| Single function | Cyclomatic ≤ 10–15; flag > 20 | McCabe-style guidance |

**Apply first to:** `App.tsx`, `handlers.ts`, `Tree.tsx`, then any new growth in `documents.ts` / `workspace.ts` / `nativeDialog.ts`.

Optional: ESLint complexity rules or a small CI script that warns on file size.

---

### 5. Keep reducers as the source of truth; push rules out of callbacks

`documentsReducer` and `workspaceReducer` are already strong. Continue:

- Side-effect-free transitions in reducers
- Hooks only for IPC, instance pool, and dialog coordination
- Avoid growing business rules inside large `useCallback` bodies

`documents.ts` (~16 KB) is large but cohesive; prefer extracting pure helpers rather than growing more action types in the same file indefinitely.

---

### 6. Stabilise async + ref patterns inside hooks

`sessionRef`, `workspaceRef`, `dialogInFlightRef`, and pending queues are justified for IPC and stale closures, but they raise cognitive load when scattered.

- Encapsulate ref + current-value sync inside the hooks from suggestion 1
- Return stable callbacks so children do not rebuild dependency graphs unnecessarily
- Document the "one dialog at a time" invariant in a single place (`useDialogQueue`)

---

### 7. Tighten explorer and tree boundaries

`Tree.tsx` (~17 KB) mixes presentation, arborist integration, and open/CRUD behaviour.

- Presentational tree + callbacks for open / view-source / CRUD
- Keep operations in `explorer/operations.ts`
- "Open path in source/formatted" orchestration in session/workspace hooks, not in the tree component

`Tree.css` (~3 KB) is fine; avoid dumping more layout rules into `App.css` if they belong to the explorer.

---

### 8. Main-process FS and supporting modules

FS layer is already split (`read`, `write`, `atomicWrite`, `mutate`, `paths`, `watch`) — good. Further improvements:

- **`paths.ts` / `mutate.ts` / `watch.ts`:** Keep pure path resolution and mutation free of IPC; ensure handlers only orchestrate
- **`recentItems.ts` + `recentItemsPath.ts` + `recentItemsWarning.ts`:** Clear separation already; avoid re-inlining record/remove logic into handlers after the split (suggestion 3)
- **`dialogs.ts` / `dialogValidation.ts`:** Keep validation electron-free and unit-tested (already done)
- **`scrubPaths.ts`:** Single place for Principle II (no absolute paths in renderer-visible errors) — call only from sanitise helpers
- **`settings.ts` / `settingsFile.ts`:** Fine; keep load/save pure where possible
- **`menu.ts` / `shortcuts.ts`:** Prefer declarative maps over large switch bodies as commands grow
- **`workspace.ts`:** Own watcher lifecycle; handlers should not duplicate watch-dir logic

---

### 9. Preload and shared contracts

- **`src/preload/index.ts` (~5 KB):** Keep as a thin typed bridge; no business logic
- **`src/shared/ipc-contract.ts` (~7 KB):** Central contract — good; when adding channels, keep Result/error codes consistent
- **`src/shared/nativeDialog.ts` (~12 KB):** Dialog request/response shapes and any pure helpers belong here; UI copy can stay with chrome
- **`src/shared/errors.ts` / `shortenPath.ts`:** Small and focused — leave as-is; extend rather than duplicate

Avoid leaking main-only types into the renderer via shared; keep the contract the single shared surface.

---

### 10. Renderer feature modules (chrome, editor, tabs, status)

| Area | Files | Suggestion |
|------|--------|------------|
| Chrome | `HamburgerMenu.tsx`, `menuModel.ts` | Keep menu model data-driven; avoid putting session side effects in the menu component |
| Editor | `CrepeHost.tsx`, `EditorPanel.tsx`, `SourceView.tsx`, `instancePool.ts`, `taskBackspace.ts`, `toolbarLabels.ts` | Good boundaries; keep Crepe-specific code inside `CrepeHost` / pool; pure helpers (`taskBackspace`, labels) stay unit-tested |
| Tabs | `TabBar.tsx` | Thin; receive session props/callbacks only |
| Status | `StatusFooter.tsx` | Thin; avoid pulling in session mutation |
| CSS | `App.css` (~14 KB) | Consider splitting by area (`chrome.css`, `explorer.css`, `editor.css`) if it keeps growing |

Do not merge editor policy (raw bytes, baseline) into UI components — keep it in state/domain (suggestions 2 and 5).

---

### 11. Preserve domain policies while refactoring

Do **not** dilute these invariants:

- Raw-bytes policy vs Crepe normalization (`editorBaseline`, `markdownSame`, `editorMatchesContent`)
- Live-dirty detection accounting for debounce
- Editor instance pool: LRU eviction of **clean** documents only
- Single native confirmation at a time; deferred external notices and errors
- Two-phase folder open (prepare → commit) so the live workspace is never destroyed on cancel/failure
- Principle II: scrub absolute paths from renderer-visible errors
- Spec / FR / US references in comments

Add or extend a short `docs/domain-policies.md` (or point at existing specs) so extractions stay faithful.

---

### 12. Optional client state layer (only if needed)

If hook composition still causes awkward prop/ref drilling:

- Zustand or Jotai for session + workspace slices, **or**
- Keep dual `useReducer`s and pass dispatchers + selected state

Prefer hooks first (suggestion 1). Do not introduce a global store solely to shrink files.

---

### 13. Unit tests (`tests/main`, `tests/renderer`) — structure and size

**Strengths:** Pure reducer tests (`documents.test.ts`, `workspace.test.ts`), electron-free validation, path/mutate/write coverage, roundtrip fixtures, StrictMode purity checks. This is the right shape for maintainability.

**Suggestions:**

1. **Split oversized unit files by describe-domain**  
   - `documents.test.ts` (~30 KB): split into e.g. `documents.open.test.ts`, `documents.dirty.test.ts`, `documents.save.test.ts`, `documents.external.test.ts`, `documents.view.test.ts` (or equivalent folders). Shared `createSession()` helpers in a local `helpers.ts`.  
   - `workspace.test.ts` (~13 KB): same idea if more actions accumulate.  
   - `nativeDialog.test.ts` (~14 KB): group by dialog kind.

2. **Mirror production layout**  
   - `tests/main/` ↔ `src/main/` (already close)  
   - `tests/renderer/` ↔ `src/renderer/state`, `explorer`, `editor`, `chrome`  
   - When extracting pure domain modules (suggestion 2), colocate or place tests under `tests/renderer/domain/`.

3. **Keep tests pure where the production code is pure**  
   - Continue testing reducers and path/dialog validation without Electron.  
   - After splitting `handlers.ts`, prefer testing extracted pure helpers; use thin integration tests only where IPC registration must be proven.

4. **Shared test utilities**  
   - Centralise session/workspace factories, fixture paths, and common expectations to avoid copy-paste across large suites.

5. **Coverage targets (guidance, not dogma)**  
   - Aim for high coverage on reducers, path resolution, mutate, dialog validation, recent-items list logic.  
   - Do not chase 100% on `App.tsx` / handlers glue — cover that via e2e and smaller integration tests after extractions.

---

### 14. E2E tests (`tests/e2e`) — structure and size

**Strengths:** Playwright + Electron, `AME_CONFIG_DIR` isolation, dialog stubs, US/spec-oriented scenarios, careful process teardown (`closeAppDiscardingQuit`). Fixtures under `tests/fixtures/roundtrip/` are useful.

**Problems:** Individual specs are very large (`recent.spec.ts` ~33 KB, `organize.spec.ts` ~21 KB, others 12–16 KB), with repeated setup, menu helpers, and stubs.

**Suggestions:**

1. **Expand shared launch helpers** (`tests/e2e/launch.ts` is already the right place)  
   - `openFolder(path)`, `openFile(path)`, `stubDialog(path)`, `typeInEditor(text)`, `clickFileMenu(...)`, recent-menu helpers, message-box assertions  
   - One place for env (`AME_CONFIG_DIR`), beforeEach/afterEach lifecycle patterns

2. **Split large specs by user story or feature**  
   - e.g. `recent/` → `recent.open.spec.ts`, `recent.deleted.spec.ts`, `recent.persistence.spec.ts`, `recent.grouping.spec.ts`  
   - Same for `organize/`, `source/`, `tabs/`, `native/`, `chrome/`  
   - Shared `beforeAll` workspace fixtures via a helper that creates temp dirs once per file or suite

3. **Avoid duplicating unit-level assertions in e2e**  
   - E2E should prove wiring: menu → IPC → UI, external delete, quit with dirty tabs, path scrubbing in UI  
   - Leave exact dirty-flag matrix and reducer edge cases to unit tests

4. **Stable selectors**  
   - Prefer roles / test ids over long CSS chains where possible, so chrome refactors do not break every spec

5. **Runtime cost**  
   - Large e2e files that launch Electron per test are slow; shared app lifecycle where safe, or project-level parallelisation, keeps CI maintainable as the suite grows

6. **Fixtures**  
   - Keep `tests/fixtures/roundtrip/` for byte-policy cases; add more small markdown fixtures rather than building content only inside specs when the same content is reused

---

### 15. Align tests with refactors (process)

When applying suggestions 1–3:

1. Extract pure helpers **with tests first** (or move existing tests onto the new modules).  
2. Extract hooks with focused unit/integration tests where behaviour is non-trivial (dialog queue, dirty live check).  
3. Keep e2e green as a regression net; only rewrite e2e when selectors or flows intentionally change.  
4. Delete or shrink e2e cases that fully duplicate new unit coverage.

This order avoids a long "red" period and keeps the strong existing suite as a safety net.

---

### 16. Track metrics lightly in CI

Inspired by KLOC / complexity thinking:

- Warn (or fail) when any `src/**/*.{ts,tsx}` exceeds soft LOC limits  
- Optional ESLint complexity on functions  
- Report test file sizes occasionally so e2e/unit suites do not silently become unmaintainable  
- Keep Vitest + Playwright; add unit tests for every pure extraction

---

### 17. Documentation and agent/spec hygiene

The repo already has `.specify`, AGENTS.md, CLAUDE.md, and heavy FR/US comments. For maintainability:

- One short index of domain policies (suggestion 11) linked from README or AGENTS  
- When splitting files, update any path references in agent/spec docs so AI-assisted work does not target deleted paths  
- Prefer documenting *invariants* over restating implementation in multiple comments

---

## Suggested order of work

1. Extract pure helpers (suggestion 2) and ensure unit tests cover them.  
2. Introduce `useDialogQueue` + `useDocumentSession`; move save/close/quit/external flows.  
3. Extract workspace/tree and menu hooks; thin `App.tsx`.  
4. Split main IPC handlers (suggestion 3); keep behaviour pinned by existing main unit tests + e2e.  
5. Split largest unit test files by domain (suggestion 13).  
6. Factor e2e helpers and split the largest specs (suggestion 14).  
7. Soft size/complexity limits + optional CI warnings (suggestions 4 and 16).  
8. CSS / chrome / docs polish as needed (suggestions 10 and 17).

---

## What not to change aggressively

- Electron main / preload / renderer / shared layout  
- Typed `ipc-contract` and Result/error-code conventions  
- Milkdown/Crepe integration boundaries (`CrepeHost`, `instancePool`)  
- Two-phase folder open, path scrubbing, raw-bytes policy, single-dialog guard  
- Spec-driven behaviour and confirmation semantics  
- Existing pure unit tests for reducers and FS helpers — move/split, do not gut  

Refactor for maintainability; keep behavioural contracts intact.

---

## Inventory reference (`src` + `tests`)

### `src/main`
| Path | ~Size | Notes |
|------|-------|--------|
| `ipc/handlers.ts` | 28 KB | Split (suggestion 3) |
| `fs/paths.ts` | 5 KB | Keep pure |
| `fs/watch.ts` | 4 KB | Keep lifecycle here |
| `fs/mutate.ts` | 4 KB | Keep pure |
| `fs/read.ts` | 4 KB | Keep pure |
| `recentItems.ts` | 5 KB | Good separation |
| Other main modules | 1–3 KB | Generally fine |

### `src/preload`
| Path | ~Size | Notes |
|------|-------|--------|
| `index.ts` | 5 KB | Thin bridge only |

### `src/renderer`
| Path | ~Size | Notes |
|------|-------|--------|
| `App.tsx` | 51 KB | Primary split (suggestion 1) |
| `explorer/Tree.tsx` | 17 KB | Thin UI (suggestion 7) |
| `state/documents.ts` | 16 KB | Cohesive; extract helpers |
| `App.css` | 14 KB | Optional split by area |
| `chrome/HamburgerMenu.tsx` | 10 KB | Keep model-driven |
| `state/workspace.ts` | 10 KB | Cohesive |
| `editor/CrepeHost.tsx` | 8 KB | Keep Crepe-local |
| Smaller editor/tabs/status/hooks | 1–4 KB | Fine |

### `src/shared`
| Path | ~Size | Notes |
|------|-------|--------|
| `nativeDialog.ts` | 12 KB | Shared shapes/helpers |
| `ipc-contract.ts` | 7 KB | Single contract surface |
| `shortenPath.ts` / `errors.ts` | small | Fine |

### `tests/main` (unit)
| Path | ~Size | Notes |
|------|-------|--------|
| `recentItems.test.ts` | 11 KB | OK; split if it grows with handlers |
| `paths` / `mutate` / `ipc` / others | 2–7 KB | Good coverage shape |

### `tests/renderer` (unit)
| Path | ~Size | Notes |
|------|-------|--------|
| `documents.test.ts` | 30 KB | Split by domain (suggestion 13) |
| `nativeDialog.test.ts` | 14 KB | Split by kind if needed |
| `workspace.test.ts` | 13 KB | Watch growth |
| Others | 2–5 KB | Fine |

### `tests/e2e`
| Path | ~Size | Notes |
|------|-------|--------|
| `recent.spec.ts` | 33 KB | Split + helpers (suggestion 14) |
| `organize.spec.ts` | 21 KB | Split |
| `source` / `tabs` / `native` / `chrome` | 12–16 KB | Factor shared setup |
| `launch.ts` | 9 KB | Expand as shared hub |
| `app.spec.ts` | 4 KB | Fine |

### `tests/fixtures`
Roundtrip markdown fixtures — keep and extend for byte-policy cases.

---

*Document expanded to cover the full `src` tree and `tests`. Suggestions are advisory and ordered by expected impact on long-term maintainability.*
