# Tasks: Recent Items

**Feature**: `004-recent-items` | **Date**: 2026-08-03

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Implementation strategy**: a persistence + native-menu feature over the Phase
1–6 base and the spec-002/003 work. Phase 1 verifies the baseline and moves the
shared `shortenPath` helper to `src/shared/` (the main-process menu needs the
same unambiguous long-path shortening the footer uses — research R2). Phase 2
lays down the contract types and the pure, testable recent-items store
(foundational). The user stories then land in priority order: US1 records on
successful opens and presents the Recent Items menu with reopen + restart
persistence; US2 distinguishes file vs folder; US3 removes unavailable entries.
The e2e suite is written in the phase that owns each user story, mirroring the
003 pattern.

Per the constitution, every user-visible behaviour gets e2e coverage in
`tests/e2e/recent.spec.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a green baseline to measure against and the `shortenPath` move that
main's menu labels depend on.

- [X] T001 Establish a green baseline: run `npm run lint`, `npm run typecheck`,
      `npm run test` on the `004-recent-items` branch and record the result in
      this file
- [X] T002 Move `shortenPath` from `src/renderer/status/shortenPath.ts` to
      `src/shared/shortenPath.ts` (verbatim, pure); update imports in
      `src/renderer/status/StatusFooter.tsx` and
      `tests/renderer/shortenPath.test.ts` (research R2)

**Checkpoint**: baseline green; `shortenPath` test suite still passes from the
shared location.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the contract types and the store exist before any user story touches the menu or handlers.**

- [X] T003 Extend `src/shared/ipc-contract.ts`: `RecentKind = 'file' | 'folder'`,
      `RecentItem { path, kind, name, lastOpenedAt }`, `MenuCommand` gains the
      object form `{ type: 'open-recent'; path: string; kind: RecentKind }`, and
      `DesktopApi` gains `openRecentFile(path)` plus the two-phase folder-open
      ops `prepareFolderOpen(path?)` / `commitFolderOpen()` /
      `cancelFolderOpen()` and the `onRecentItemsWarning` / `onRecentItemsOk`
      events
- [X] T004 Implement `src/main/recentItems.ts` — a pure, electron-free store:
      `loadRecentItems(filePath)` (tolerant parse, sort by `lastOpenedAt` desc,
      dedupe by `(path, kind)`, per-type cap 5/5), `saveRecentItems(filePath,
      items)` (atomic temp+rename), `recordRecentItem(items, item)`
      (upsert-to-front, per-type cap, folders-first canonical order),
      `removeRecentItem(items, path, kind)` (research R1)
- [X] T005 [P] Write `tests/main/recentItems.test.ts`: missing/unreadable/
      malformed/garbage-entry tolerance, ordering, dedupe by `(path, kind)`,
      per-type 5/5 least-recent eviction (own type only), remove, atomic save
      leaves no partial file on failure
- [X] T006 [P] Extend `tests/main/ipc.test.ts` — shape tests for the `open-recent`
      MenuCommand object form and the new `DesktopApi` operation signatures
      (folder-open ops and the recent-items events)

**Checkpoint**: `npm run test` main + renderer projects pass with the new
contract and store.

---

## Phase 3: User Story 1 — Reopen recent files and folders (P1)

**Goal**: the File menu records qualifying opens and offers them for reopening,
surviving restarts (FR-001…003, 005, 006, 012, 013).

**Independent Test**: Quickstart (1–3).

### Implementation

- [X] T007 [US1] `src/main/menu.ts` — add a **Recent Items** submenu to File:
      empty list → one disabled item "No Recent Items"; else one enabled item
      per entry labelled `File: <shortenPath(path, 60)>` /
      `Folder: <shortenPath(path, 60)>`; clicking sends
      `{ type: 'open-recent', path, kind }` on `menu:command`; export
      `refreshApplicationMenu(window)` (research R3)
- [X] T008 [US1] `src/main/ipc/handlers.ts` — record on success: after
      `file:openDialog` returns a file, `recordRecentItem({ path: filePath,
      kind: 'file', name: basename })`; after `workspace:openDialog` returns a
      workspace, `recordRecentItem({ path: realRootPath, kind: 'folder', name:
      basename })`; call `refreshApplicationMenu` after each (FR-002/003/013)
- [X] T009 [US1] `src/main/ipc/handlers.ts` — `recent:openFile` handler and the
      `workspace:prepareFolderOpen(path)` recent-folder leg (folder opens are
      two-phase, research R5): reject paths not in the stored list
      (`OUTSIDE_WORKSPACE`), realpath-resolve, open like the dialog handlers
      (relative path + watchDir when inside the workspace), `recordRecentItem`
      to bump to front, return the result (research R4, FR-006)
- [X] T010 [US1] `src/preload/index.ts` — wire `openRecentFile` →
      `recent:openFile`, and `prepareFolderOpen`/`commitFolderOpen`/
      `cancelFolderOpen` → the `workspace:*` channels, plus the
      `onRecentItemsWarning` / `onRecentItemsOk` events
- [X] T011 [US1] `src/renderer/App.tsx` — handle the `open-recent` MenuCommand:
      file → `openRecentFile` → `OPEN_EXISTING`; folder → the prepare →
      (unsaved-work confirm) → commit flow → `REPLACE`; failures surface via the
      existing `operationError` dialog with the session untouched
      (FR-007/009/010)
- [X] T012 [US1] Write `tests/e2e/recent.spec.ts` US1 scenarios: open a file
      via the File menu (dialog stubbed via `electronApp.evaluate`) then reopen
      from Recent Items; open a folder then reopen it as the workspace;
      reopening moves the entry to front without a duplicate; a fresh app with
      an empty list shows the disabled "No Recent Items"; restart persistence
      (relocate `appData` via `app.setPath` so the config is per-test)

**Acceptance**: recorded entries appear in File > Recent Items, reopen through
the correct path, dedupe on reopen, and survive restart.

---

## Phase 4: User Story 2 — Distinguish recent item types (P2)

**Goal**: every entry visibly identifies file vs folder before selection and
opens with the matching behaviour (FR-007, FR-008).

**Independent Test**: Quickstart (4).

### Implementation

- [X] T013 [US2] `tests/e2e/recent.spec.ts` US2 scenarios: with one file and one
      folder recorded, the menu labels read `File: …` and `Folder: …`; selecting
      the file opens a tab; selecting the folder replaces the workspace
      (behavioural, driven via `Menu.getApplicationMenu()` item clicks)

**Acceptance**: labels distinguish types; each opens through its own path.

---

## Phase 5: User Story 3 — Recover gracefully from unavailable entries (P2)

**Goal**: a recent entry whose target is gone/unreadable is explained, leaves
the session untouched, and is removed from the menu (FR-009, FR-010).

**Independent Test**: Quickstart (5).

### Implementation

- [X] T014 [US3] `tests/e2e/recent.spec.ts` US3 scenarios: delete a recorded file
      outside the app, click its Recent Items entry → in-app error, session
      unchanged, entry removed; same for a deleted folder; a recorded entry
      never in the list is rejected (renderer cannot open arbitrary paths)

**Acceptance**: unavailable entries explain, preserve the session, and vanish
from Recent Items.

---

## Phase 6: Cross-cutting — edges, polish, gates

- [X] T015 [P] `tests/e2e/recent.spec.ts` edges + guards: explorer-opened files
      never appear (FR-013); more than 5 qualifying opens of a type keep only
      the 5 most recent of that type (FR-012); a long / non-Latin path shortens
      with `…` keeping the final name (spec edge); corrupt config file → app
      starts with an empty list (FR-011)
- [X] T016 [P] Run quickstart.md smoke and full `npm run lint`,
      `npm run typecheck`, `npm run test`, `npm run test:e2e`; review
      plan/research/data-model/contracts consistency

**Checkpoint**: `npm run test:e2e` all green alongside lint/typecheck/vitest.

---

## Phase 7: US4 — Clear Recent Items + grouped menu + per-type cap (P2)

**Goal**: a Clear Recent Items action (FR-014), folders grouped above files in
the submenu (FR-015), and a per-type 5/5 cap instead of a combined 10
(FR-012).

### Implementation

- [ ] T017 [US4] `src/main/recentItems.ts` — per-type cap: `recordRecentItem`
      evicts only the least-recent entry of the item's own type (5 max per
      type); `normalizeRecentItems` caps and canonicalizes folders-first
- [ ] T018 [US4] `src/main/menu.ts` — Recent Items submenu becomes folders →
      separator → files → separator → **Clear Recent Items** (groups with no
      entries are omitted); the Clear action writes an empty list (best-effort,
      FR-011) and rebuilds the menu without touching the renderer
- [ ] T019 [US4] `src/main/recentItemsWarning.ts` — extract the shared quiet
      footer-warning helper (FR-011) used by both `handlers.ts` and `menu.ts`
- [ ] T020 [US4] `tests/main/recentItems.test.ts` — per-type cap (own-type
      eviction only), folders-first canonicalization, clear (save-empty)
- [ ] T021 [US4] `tests/e2e/recent.spec.ts` — grouping order + Clear placement
      (FR-015), US4 clear empties the menu, leaves the session untouched, and
      persists across restart; per-type caps for files and folders (FR-012)

**Acceptance**: the menu lists folders before files, caps each type at 5, and
offers Clear Recent Items at the bottom; clearing empties the history without
disturbing the session and survives restart.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|-----------|--------|
| 1 Setup | — | 2 |
| 2 Foundational | 1 | 3–5 |
| 3 US1 (P1) | 2 | 4–6 |
| 4 US2 (P2) | 3 (labels) | 6 |
| 5 US3 (P2) | 3 (open handlers) | 6 |
| 6 Polish | all | 7 |
| 7 US4 + grouping (P2) | 6 | — |

### Parallel Opportunities

- T005 (store tests) and T006 (IPC shape tests) are independent of each other
  but both belong to Phase 2; T004 before T005.
- T015/T016 touch disjoint files (`recent.spec.ts` vs quickstart/gates) — `[P]`.
- The e2e suite (T012, T013, T014, T015) touches `tests/e2e/recent.spec.ts`
  sequentially; write the spec file incrementally per phase.

### High-level guarantee

Document model, save/close/quit logic, and all existing explorer/workspace
behaviour are untouched. Main-process additions are one new store module, two
new IPC handlers, and recording points in the two existing dialog handlers; the
renderer change is confined to the `menu:command` switch. `shortenPath` is moved
(not duplicated) into `src/shared/`.

---

## Notes

- [P] tasks touch disjoint files; the remaining tasks are sequential because
  they edit the same `menu.ts`/`handlers.ts`/`App.tsx` surfaces.
- Every task leaves the repo in `npm run typecheck`-clean state.
- Deviations from the research/plan must be written there per AGENTS.md before
  continuing.
- The security and data-loss invariants (path guard, atomic save, dirty
  prompts) are preserved: recent-open re-validates against the sanctioned list,
  config writes are atomic, and recording never touches the documents reducer.
- MVP = end of Phase 3 (US1); US2 and US3 are increments.
