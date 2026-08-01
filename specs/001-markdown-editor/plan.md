# Implementation Plan: Desktop Markdown Editor

**Branch**: `001-markdown-editor` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-markdown-editor/spec.md`

## Summary

A single-window Electron desktop application presenting a resizable
sidebar-and-editor split. The main process owns all filesystem access and
exposes a fixed set of seven named operations across a `contextBridge` preload
API; the renderer is a sandboxed React application with no Node access.

Every path crosses one central `resolveWithinRoot` guard that resolves real
paths and confirms containment within the opened workspace before any syscall.
Saves are atomic (temp file in the target directory, then rename). Each open
document owns its own Milkdown Crepe instance, because Crepe's API only accepts
content at construction and a shared instance would merge undo histories across
files — see [research.md](./research.md) R1.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`, across main, preload, and renderer

**Primary Dependencies**: Electron 43, React 19, `@milkdown/crepe` 7.21.3, `react-arborist` 3.16, `react-resizable-panels` 4.12, `chokidar` 5

**Storage**: The user's filesystem. Application settings (sidebar width, theme override) in Electron's `userData` directory as JSON. No database.

**Testing**: Vitest 4 — a `node` project for main-process logic, a `jsdom` project for renderer state

**Target Platform**: Windows, macOS, Linux desktop

**Project Type**: Desktop application, three build targets (main / preload / renderer)

**Performance Goals**: Keystroke to glyph under 50 ms at 10,000 lines; document open under 1 s; tab switch under 100 ms; 5,000-entry folder listed under 2 s

**Constraints**: Renderer fully sandboxed with no Node; all disk I/O in main; atomic saves; at most 8 live editor instances

**Scale/Scope**: Single user, single window, one workspace folder, ~10 open documents typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; preload exposes a fixed operation list with no generic `invoke` | **PASS** — see `contracts/preload-api.md`; the contract is a closed union of 7 operations |
| II. Every Path Is Untrusted | All paths validated in main against the resolved real root | **PASS** — single `resolveWithinRoot` chokepoint, research.md R6 |
| III. Never Lose The User's Words | Atomic writes; failed save stays dirty; confirmation before discard | **PASS** — research.md R7; FR-021/022/023; dirty documents never evicted (R2) |
| IV. Calm, Predictable Editing | No sync disk work on keystroke path; tab switch preserves undo/cursor/scroll | **PASS** — per-tab instances (R1), hidden not unmounted (R3) |
| V. Test What Can Corrupt Or Escape | Adversarial path tests, atomic write tests, dirty-state tests, IPC contract tests, round-trip tests | **PASS** — research.md R12; these are the `main` and `renderer` Vitest projects |

**Post-design re-check (after Phase 1)**: Still passing. One item requires
justification and is recorded under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-markdown-editor/
├── plan.md              # This file
├── spec.md              # Requirements
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities and state
├── quickstart.md        # Phase 1 manual verification script
├── contracts/
│   ├── preload-api.md   # Renderer-facing API surface
│   └── ipc-channels.md  # Main-process channel contracts and errors
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── main/                        # Electron main process — the only place `fs` appears
│   ├── index.ts                 # App lifecycle, BrowserWindow creation
│   ├── menu.ts                  # Native application menu
│   ├── workspace.ts             # Opened-folder state, real-root caching
│   ├── fs/
│   │   ├── paths.ts             # resolveWithinRoot — the security boundary
│   │   ├── read.ts              # readDir, readFile
│   │   ├── write.ts             # Atomic writeFile
│   │   ├── mutate.ts            # mkdir, rename/move, trash
│   │   └── watch.ts             # chokidar watcher, self-write suppression
│   ├── ipc/
│   │   ├── register.ts          # Handler registration
│   │   └── handlers.ts          # One handler per channel, argument validation
│   └── settings.ts              # Persisted layout and theme settings
│
├── preload/
│   └── index.ts                 # contextBridge — fixed operation list
│
├── shared/
│   ├── ipc-contract.ts          # Request/response types shared by main and renderer
│   └── errors.ts                # Typed error codes
│
└── renderer/
    ├── main.tsx                 # React entry
    ├── App.tsx                  # Panel layout
    ├── state/
    │   ├── documents.ts         # Open documents, active document, dirty tracking
    │   ├── workspace.ts         # Tree state
    │   └── settings.ts          # Theme and layout
    ├── editor/
    │   ├── CrepeHost.tsx        # Uncontrolled boundary React must not re-render
    │   └── instancePool.ts      # LRU cap of 8 live instances
    ├── explorer/
    │   ├── Tree.tsx             # react-arborist
    │   └── operations.ts        # Rename/delete/move/create flows
    └── tabs/
        └── TabBar.tsx

tests/
├── main/                        # Vitest, node environment
│   ├── paths.test.ts            # Adversarial containment cases
│   ├── write.test.ts            # Atomicity and interruption
│   ├── mutate.test.ts           # Conflict, descendant-move, trash fallback
│   ├── watch.test.ts            # Self-write suppression
│   └── ipc.test.ts              # Channel contracts and typed errors
├── renderer/                    # Vitest, jsdom environment
│   ├── documents.test.ts        # Dirty tracking, tab lifecycle, close guards
│   └── instancePool.test.ts     # LRU eviction never evicts dirty
└── fixtures/
    └── roundtrip/               # Markdown construct corpus for R5
```

**Structure Decision**: Three-target Electron layout mirroring the process
boundary, which is the application's security boundary. `src/shared/` holds only
types — never runtime code that could pull Node APIs toward the renderer. The
directory split makes Principle I auditable by inspection: any `import ... from
'fs'` outside `src/main/` is a defect, enforceable with a lint rule.

## Phase 1 design decisions

**IPC surface** (see `contracts/ipc-channels.md`): seven operations —
`openFolder`, `readDir`, `readFile`, `writeFile`, `createEntry`, `moveEntry`,
`trashEntry` — plus two main→renderer events, `workspace:changed` and
`document:externallyChanged`. Every response is a discriminated union of
`{ ok: true, ... }` or `{ ok: false, code, message }`; handlers never throw
across the boundary.

**Error codes** are a closed set (`OUTSIDE_WORKSPACE`, `NOT_FOUND`, `CONFLICT`,
`PERMISSION`, `LOCKED`, `TOO_LARGE`, `NOT_TEXT`, `TRASH_UNAVAILABLE`, `IO`) so
the renderer can present specific, actionable messages per FR-010/SC-010 without
receiving raw OS strings that may contain paths outside the workspace.

**Tree filtering** (FR-010) happens in the **main** process. `readDir` returns
only directories and `.md`/`.markdown` files. Filtering in main rather than the
renderer means the renderer is never told that hidden files exist.

**Document identity** is the resolved workspace-relative path for saved
documents, and a generated id for never-saved ones — see `data-model.md`.

**Watch scope is lazy** (2026-08-01, research.md R16): chokidar scans only the
workspace root at open; directories are added to the watch set when the tree
expands them or a document inside them is opened. A full-tree scan made opening
a 7,000-file folder take ~8 s on Windows.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Up to 8 concurrent editor instances rather than one | FR-017 requires each document to keep its own undo history, cursor, and scroll position across tab switches. Crepe accepts content only via `defaultValue` at construction and exposes no `setMarkdown` (research.md R1). | A single shared instance would require `replaceAll` on the underlying ProseMirror state, which shares one undo stack across all documents. Undo after a tab switch would then revert an edit in a *different file* — a direct breach of FR-017 and Principle IV. Reimplementing per-document history on top of a shared instance is more code and more risk than holding several instances. |

No other principle is violated. The memory cost above is bounded by the LRU cap
in research.md R2, which never evicts a dirty document.

## Deferred to a later feature

Packaging (electron-builder), release automation (GitHub Actions), `.md` file
association, app id and product name, and auto-update. Recorded in
research.md R15 and in the spec's Assumptions. Agreed scope for this feature
ends at a working application run from source.
