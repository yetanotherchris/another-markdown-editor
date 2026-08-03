# Implementation Plan: Native Explorer

**Branch**: `003-native-explorer` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-native-explorer/spec.md`

## Summary

Make the explorer look and behave like a native desktop application rather than a
plain web tree. The tree's folders, files and hierarchy controls move from emoji
and tiny unicode triangles to a single cohesive icon set; the "New" and "Open
Folder" toolbar buttons gain recognizable icons; a persistent status footer
replaces the header's active-document display with a bottom-left active-file
label and a bottom-right workspace-location label (full path, or an unambiguous
shortened form that keeps the final folder name visible); and the whole
interface runs on a locally-bundled modern sans-serif typeface (Inter) with the
icons, so nothing depends on a network connection.

This is an **appearance + context-placement** feature (spec Assumptions). It does
not change workspace access, file operations, explorer selection, or document
tab behavior. The only functional delta is a small additive IPC change: the
workspace dialog now also returns the workspace's full path so the footer can
display it (research R-Path).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies** (new): `lucide-react` ^1.28 (ISC — freely
distributable icon set, renders inline SVG, offline) and `@fontsource/inter`
^5.3 (OFL-1.1 — Inter typeface, woff2 assets bundled locally by Vite, no
network fetch). Existing: Electron 43, React 19, `@milkdown/crepe` 7.21.3,
`react-arborist` 3.16.

**Storage**: unchanged — the user filesystem + settings.json in `userData`.

**Testing**: Vitest 4 (node project for `tests/main`, jsdom for
`tests/renderer`); Playwright via `npm run test:e2e` (build + launch, headless).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: SC-003 — footer's left region reflects a tab switch
within 250 ms (the footer derives from the existing reducer state, so it is a
pure render of `activeDoc`; no new state or IPC on the switch path). SC-004 —
the workspace label never overlaps or clips other footer content; the shortened
form is computed once per width measurement, not per keystroke.

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main; icons and
fonts are static bundled assets; no network requests at runtime; the source
textarea stays monospace (spec 002 decision — raw-bytes editing surface).

**Scale/Scope**: Single window, ~10 open documents; one footer row; packaging and
dynamic themes out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Icons/fonts are static assets in the renderer bundle; the only main-process change adds a display path to the existing `workspace:openDialog` result; no new channel, no `invoke` escape | **PASS** — research R-Path |
| II. Every Path Is Untrusted | No file operation changes. The renderer gains the *workspace root* for display only; every fs call still resolves and validates in main. The root path is not used to read or write anything | **PASS** |
| III. Never Lose The User's Words | No save/close/quit/delete logic changes; the footer is display-only | **PASS** |
| IV. Calm, Predictable Editing | No work on the keystroke path; footer re-renders from state; path shortening is a cheap pure function driven by a ResizeObserver, never by typing | **PASS** |
| V. Test What Can Corrupt Or Escape | `shortenPath` pure-function unit tests (seam/edge/overflow), workspace reducer root test, IPC shape test, full e2e suite at `tests/e2e/native.spec.ts` | **PASS** |

## Phase 1 Design decisions

**Icon set (US1/US2, FR-001…003, 004–005)** — `lucide-react`, the same family
of line icons used by desktop note apps. Tree rows: `Folder` / `FolderOpen` for
directories (distinct open/closed glyphs), `FileText` for markdown files, and
`ChevronRight` / `ChevronDown` as the expand/collapse affordance (replacing the
small `▸`/`▾` triangles and emoji). Toolbar: `Plus` for **New** and `FolderOpen`
for **Open Folder**, each keeping its visible text label so the accessible name
("New", "Open Folder") and the existing e2e locators are unchanged. All
decorative icons carry `aria-hidden="true"`; the toggle keeps `role="button"`
+ `aria-label` "Expand"/"Collapse" and a visible focus state (FR-013).

**Typeface (US4, FR-006/007)** — Inter via `@fontsource/inter` (OFL-1.1),
imported as CSS (`400` + `600` weights) in `main.tsx`. Vite bundles the woff2
files into `out/renderer/`, so the app renders offline from `file://`. The
`@font-face` srcs are relative asset paths, never a remote URL. The typeface is
applied to `html/body` and to the editor by overriding Crepe's
`--crepe-font-default` / `--crepe-font-title` on `.milkdown` so headings and
body text share the same sans-serif family (clean desktop-editor appearance).
The source textarea stays monospace (spec 002's raw-bytes surface; FR-006
targets the interface chrome).

**Status footer (US3, FR-008…012)** — a new `.app-footer` bar at the bottom of
`.app-container` with a left region and a right region:

- **Left (active document)**: `activeDoc.title` plus the existing dirty marker,
  rendered in a span that keeps the class `.document-title` so every existing
  e2e test that queries `.document-title` keeps passing, but the element now
  lives in the footer, not the toolbar (FR-011: not duplicated in the header).
  When no document is active the region shows a muted "No document open" — never
  a stale file name.
- **Right (workspace location)**: `workspace.root` (full path, now populated by
  the main process; research R-Path) or, when the measured width is too small,
  `shortenPath(path, maxChars)` — an unambiguous shortened form that always keeps
  the final folder name whole and prefixes the tail with `…` (FR-010). When no
  workspace is open the region shows a muted "No folder open". The full path is
  also exposed as a `title` tooltip so the complete location is never lost.

The footer updates automatically because it derives from `session.activeId` /
`activeDoc` and `workspace` reducer state; opening, closing, replacing,
renaming or clearing a document or workspace re-renders it in the same frame
(FR-012). Path shortening is driven by `useElementSize` on the
`.footer-workspace-region` **container** (ResizeObserver), so it re-computes on
window resize and never on keystrokes. Measuring the workspace span instead
would be a feedback loop — the shortened text shrinks the span it was sized
against — so the container is measured (research R4; deviation recorded there
and in `research.md`).

**Header cleanup (FR-011)** — the `.document-title` span and the
`.workspace-name` span are removed from the `.toolbar`; the header keeps only
the two icon+text buttons. The sidebar header's `.workspace-title` (folder
name over the tree) is unchanged — it is the explorer pane's own header, not
the application header.

**Workspace path plumbing (R-Path)** — `WorkspaceInfo` gains `path: string |
null` (the realpath of the opened folder). `workspace:openDialog` returns it;
the two `REPLACE` dispatches in `App.tsx` populate `WorkspaceState.root` (which
already existed but was always `null`). The renderer uses it for display only —
every filesystem operation still goes through main's `resolveWithinRoot`
guard. No new channel; this is an additive field on an existing response.

## Project Structure

### Documentation (this feature)

```text
specs/003-native-explorer/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R-Path decisions
├── data-model.md        # WorkspaceInfo.path, WorkspaceState.root, footer derivation
├── quickstart.md        # Manual verification script
├── contracts/
│   └── renderer.md      # Renderer footer/icon contract + additive IPC note
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/
├── main.tsx                     # + @fontsource/inter CSS imports (400, 600)
├── App.tsx                      # toolbar icon buttons; footer; REPLACE gains root: path
├── App.css                      # Inter font stack; footer bar; button icon layout; Crepe font override
├── status/
│   ├── StatusFooter.tsx         # NEW: left document label + right shortened workspace label
│   └── shortenPath.ts           # NEW: pure path-shortening helper (unit-tested)
└── explorer/
    ├── Tree.tsx                 # lucide folder/file/chevron icons (aria-hidden decorative; toggle keeps label/focus)
    └── Tree.css                 # icon/toggle sizing + focus-visible

src/shared/ipc-contract.ts       # WorkspaceInfo + path: string | null
src/main/ipc/handlers.ts         # workspace:openDialog returns path: workspaceRoot
src/preload/index.ts             # no change (typed via WorkspaceInfo)

tests/
├── main/ipc.test.ts             # WorkspaceInfo shape test gains path
├── renderer/
│   ├── shortenPath.test.ts       # NEW: pure-function coverage
│   └── workspace.test.ts         # root already covered; no change needed
└── e2e/
    └── native.spec.ts           # NEW: US1–US4 + edges (offline font/icons, footer)
```

**Structure decision**: the feature is mostly renderer-side. The one main-process
change (returning the workspace path) is confined to `handlers.ts` +
`ipc-contract.ts`; the process boundary stays auditable.

## Phase status

- Phase 1: Setup (baseline, dependency verification)
- Phase 2: Foundational (WorkspaceInfo.path + shortenPath util)
- Phase 3: US1 — native tree icons
- Phase 4: US2 — toolbar icon buttons
- Phase 5: US3 — status footer + header cleanup
- Phase 6: US4 — Inter typeface (offline)
- Phase 7: e2e suite + final gates

## Deferred / later features

- Dark theme variants of the new chrome (the app already has a
  `themeOverride` setting but this feature ships the default light look).
- Icons in the tree context menu (the spec scopes icons to folders, files,
  hierarchy controls and the two requested action controls).
- A recent-workspaces or path-picker in the footer (explicitly out of scope,
  spec Assumptions).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Two new runtime dependencies (`lucide-react`, `@fontsource/inter`) | FR-001/FR-006 require a single cohesive icon set and a freely distributable modern sans-serif typeface; hand-rolled SVGs would be less cohesive and harder to license-review; both are permissive (ISC / OFL-1.1), bundled locally, offline | Reusing emoji/unicode glyphs (violates FR-001/003); a remote font or icon CDN (violates FR-007) |
| The footer keeps the `.document-title` class on a moved element | Every prior-phase e2e test locates `.document-title` in the header; keeping the class in the footer satisfies FR-011 without rewriting unrelated suites | Renaming the class and rewriting ~30 e2e assertions (no user-visible benefit) |
| `WorkspaceInfo` gains the absolute workspace root for display | FR-010 requires the full location; the renderer cannot derive an absolute path it never received, and it is display-only (never used for fs) | Showing only `workspace.name` (violates "full location when space permits") |
