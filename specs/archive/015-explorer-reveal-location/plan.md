# Implementation Plan: Explorer Reveal Location

**Branch**: `015-explorer-reveal-location` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-explorer-reveal-location/spec.md`

## Summary

The workspace explorer's context menu gains a **Reveal in Explorer/Finder**
action that opens the OS file manager at a file's or folder's location. Files
are revealed with `shell.showItemInFolder` (the parent folder opens with the
file highlighted — FR-001/004); folders are opened directly with
`shell.openPath` (FR-002, and the workspace-root edge case opens the root
itself). The target path is resolved and containment-validated in the main
process with the same `resolveFile`/`resolveDirectory` helpers every other file
operation uses (FR-005), so a missing, moved, or escaping path fails closed with
a typed error that the renderer surfaces as a quiet footer note, leaving the
session untouched (FR-006). The action appears only on workspace items at any
depth (FR-007/008).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: Electron 43 (`shell`), React 19, react-arborist. No new dependencies.

**Storage**: none — read-only reveal.

**Testing**: Vitest (main project: the new handler's validation logic is covered
via the existing handler-pattern tests); Playwright e2e (stub `shell.*` in main,
drive the tree context menu).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), WYSIWYG markdown editor.

**Performance Goals**: none — a synchronous path resolve + OS call on an explicit
user action.

**Constraints**: The renderer is sandboxed (no Node, no `shell`); the reveal
MUST run in main and validate the path against the workspace root first (FR-005,
Principle II). The IPC surface is a fixed named operation (`entry:reveal`).

**Scale/Scope**: One new IPC operation, one context-menu item, one e2e suite.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | The OS file-manager call runs in MAIN via `shell`; the renderer only sends `{ path, kind }` and receives a `Result`. The preload API gains one named operation (`revealEntry`), no generic escape hatch | **PASS** |
| II. Every Path Is Untrusted | The relative path is resolved and containment-validated against the workspace root in main (`resolveFile`/`resolveDirectory`), exactly like other entry operations; an escaping path fails with `OUTSIDE_WORKSPACE` before any OS call | **PASS** |
| III. Never Lose The User's Words | Reveal is read-only and never touches documents or the workspace; a failure leaves the session unchanged | **PASS** |
| IV. Calm, Predictable Editing | No editor interaction; a quiet footer note reports failure | **PASS** |
| V. Test What Can Corrupt Or Escape | Path containment is a constitutional test area — the reveal handler reuses the tested `resolve*` helpers; e2e covers the happy path (correct OS call), the missing-path failure, and that the session is unchanged | **PASS** |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**One new named IPC operation `entry:reveal`.** Request `{ path: string,
kind: EntryKind }`. The handler runs under `withWorkspace`, validates the shape
and kind, then resolves the target with `resolveFile` (file) or
`resolveDirectory` (folder) — both re-exported helpers that realpath-resolve and
assert containment (FR-005/008). On success:
- file → `shell.showItemInFolder(resolved)` — the OS opens the parent folder
  with the file selected/highlighted (FR-001/004);
- folder → `shell.openPath(resolved)` — the OS opens the folder itself
  (FR-002); the workspace root reveals as itself (edge case). `openPath`
  resolves to an error string on failure, surfaced as `err('IO', …)` (FR-006).

A missing/deleted target throws from `resolveFile`/`resolveDirectory` with
`NOT_FOUND`; a non-file/non-directory mismatch throws `IO`; an escaping path
throws `OUTSIDE_WORKSPACE`. All map to typed `Result` errors with scrubbed
messages (Principle II).

**Context-menu label adapted per platform (FR-003, Assumptions).** The preload
exposes `platform: process.platform`; the renderer labels the item "Reveal in
Explorer" on Windows, "Reveal in Finder" on macOS, and "Reveal in file manager"
on Linux.

**Quiet, in-context error (FR-006).** The App sets the existing footer note
(`StatusFooter` `note`) from the reveal error; the session and workspace are
untouched.

## Project Structure

### Documentation (this feature)

```text
specs/015-explorer-reveal-location/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R4 decisions
├── data-model.md        # Revealed Item / OS File Manager entities
├── quickstart.md        # Manual verification script
├── contracts/
│   └── reveal.md        # entry:reveal IPC contract + validation rules
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/ipc-contract.ts       # DesktopApi.revealEntry + platform field
src/preload/index.ts             # revealEntry + platform wiring
src/main/ipc/handlers/files.ts   # entry:reveal handler (shell.showItemInFolder/openPath)
src/renderer/explorer/Tree.tsx   # onReveal prop + context-menu item
src/renderer/App.tsx             # onReveal handler → revealEntry + footer note
tests/e2e/reveal.spec.ts         # NEW: happy path, folder path, missing-path failure, session unchanged
```

**Structure decision**: the handler joins the existing `entry:*` operations in
`files.ts`; the renderer follows the `onOpen`/`onViewSource` prop pattern.

## Phase status

- Phase 1: Setup — none required (single IPC + menu item)
- Phase 2: Foundational — `entry:reveal` handler in main + preload + contract
- Phase 3: US1+US2 — the context-menu action (file and folder labels) wired through App
- Phase 4: US4 — quiet error surfacing (footer note)
- Phase 5: Polish — e2e suite, gates, spec archive, status table

## Deferred / later features

- Multi-item reveal (spec Assumptions: out of scope)
- Choosing a custom file manager (out of scope)

## Complexity tracking

None — no principle violated; the new IPC surface is one fixed named operation.
