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
      `DesktopApi` gains `openRecentFile(path)` / `openRecentFolder(path)`
- [X] T004 Implement `src/main/recentItems.ts` — a pure, electron-free store:
      `loadRecentItems(filePath)` (tolerant parse, sort by `lastOpenedAt` desc,
      dedupe by `(path, kind)`, cap 10), `saveRecentItems(filePath, items)`
      (atomic temp+rename), `recordRecentItem(items, item)` (upsert-to-front,
      cap), `removeRecentItem(items, path, kind)` (research R1)
- [X] T005 [P] Write `tests/main/recentItems.test.ts`: missing/unreadable/
      malformed/garbage-entry tolerance, ordering, dedupe by `(path, kind)`,
      cap-of-10 least-recent eviction, remove, atomic save leaves no partial
      file on failure
- [X] T006 [P] Extend `tests/main/ipc.test.ts` — shape tests for the `open-recent`
      MenuCommand object form and the two new `DesktopApi` operation signatures

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
- [X] T009 [US1] `src/main/ipc/handlers.ts` — `recent:openFile` /
      `recent:openFolder` handlers: reject paths not in the stored list
      (`OUTSIDE_WORKSPACE`), realpath-resolve, open like the dialog handlers
      (relative path + watchDir when inside the workspace; `WorkspaceState`
      replacement for folders), `recordRecentItem` to bump to front, return the
      result (research R4, FR-006)
- [X] T010 [US1] `src/preload/index.ts` — wire `openRecentFile` →
      `recent:openFile` and `openRecentFolder` → `recent:openFolder`
- [X] T011 [US1] `src/renderer/App.tsx` — handle the `open-recent` MenuCommand:
      file → `openRecentFile` → `OPEN_EXISTING`; folder → `openRecentFolder` →
      `REPLACE`; failures surface via the existing `operationError` dialog with
      the session untouched (FR-007/009/010)
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
      never appear (FR-013); more than 10 qualifying opens keep only the 10 most
      recent (FR-012); a long / non-Latin path shortens with `…` keeping the
      final name (spec edge); corrupt config file → app starts with an empty
      list (FR-011)
- [X] T016 [P] Run quickstart.md smoke and full `npm run lint`,
      `npm run typecheck`, `npm run test`, `npm run test:e2e`; review
      plan/research/data-model/contracts consistency

**Checkpoint**: `npm run test:e2e` all green alongside lint/typecheck/vitest.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|-----------|--------|
| 1 Setup | — | 2 |
| 2 Foundational | 1 | 3–5 |
| 3 US1 (P1) | 2 | 4–6 |
| 4 US2 (P2) | 3 (labels) | 6 |
| 5 US3 (P2) | 3 (open handlers) | 6 |
| 6 Polish | all | — |

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
