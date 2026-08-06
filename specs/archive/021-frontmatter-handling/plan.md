# Implementation Plan: Frontmatter Handling

**Branch**: `021-frontmatter-handling` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-frontmatter-handling/spec.md`

## Summary

Markdown files that begin with a YAML frontmatter block (`---` delimited at the
very top of the file) currently get their metadata mangled by the visual editor:
Crepe parses `---` into a thematic break and the YAML lines into bullet lists,
corrupting the user's metadata on every open.

This feature treats frontmatter as an opaque string that the system never parses
or validates. On open, the raw file bytes are split into a frontmatter block and
a body; the visual editor receives only the body, while the frontmatter lives in
the document state for the session. Source view always shows the complete file
(frontmatter + body) and is the only place frontmatter can be edited. On save,
the stored frontmatter and the current editor body are recombined verbatim, so
an unedited file round-trips byte-identically and no empty frontmatter block is
ever added to a file that had none.

This is a renderer-only feature: the main process and the IPC surface are
untouched. `readFile` returns the raw bytes; the split/join lives in a new pure
domain module so it is unit-testable without Electron.

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: Electron 43 (unchanged), React 19, `@milkdown/crepe` 7.21.3, `@milkdown/kit` 7.21.3. No new runtime dependencies.

**Storage**: unchanged — the user filesystem + settings.json in `userData`.

**Testing**: Vitest 4 (node project for `tests/main`, jsdom for `tests/renderer`); Playwright via `npm run test:e2e` (build + launch).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: SC-001 — no parse work on the keystroke path; split/join are single-pass string scans run only at open, save, and view-switch, O(n) and far below the 10,000-line editor budget.

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main; saves atomic; frontmatter preserved verbatim; no YAML parsing.

**Scale/Scope**: Single window, ~10 open documents; one frontmatter block per file at the top of the file; frontmatter editing via source view only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | New code is renderer-only; no new IPC channel, no change to the preload surface; the raw file bytes cross the existing `readFile`/`writeFile` channels unchanged | **PASS** — research.md R-Process-model |
| II. Every Path Is Untrusted | No path handling is touched; content is pure string data with no filesystem semantics | **PASS** |
| III. Never Lose The User's Words | The frontmatter is stored in document state for the session and recombined on save; a failed save keeps the document dirty (unchanged); byte-identical no-edit round trip means metadata is never silently dropped or reformatted | **PASS** |
| IV. Calm, Predictable Editing | Split/join are O(n) single-pass scans on open/save/view-switch only; nothing runs on the keystroke path | **PASS** |
| V. Test What Can Corrupt Or Escape | Round-trip fidelity is a constitutional test area; split/join get unit tests for every edge case plus an e2e suite covering open/save/source-edit/round-trip | **PASS** |

**Post-design re-check**: no principle is violated. See Complexity Tracking for the one deliberate engineering trade.

## Phase 1 Design decisions

**Renderer-only, opaque-string model.** The main process keeps returning raw
bytes from `readFile`; it never learns about frontmatter. The renderer owns a
new pure module `domain/frontmatter.ts` with `splitFrontmatter(text)` and
`joinFrontmatter(frontmatter, body)`. This keeps the IPC contract byte-identical
and the split/join unit-testable without Electron (research R1, R2).

**Document state.** `DocumentState` gains a `frontmatter: string` field — the
raw block including its `---` delimiters, or `''` when the file has none.
`content` holds the body only (what the visual editor parses and what source
view recombines into the full file). `baseline` stays the raw full-file bytes
read from disk (or the last written bytes after a save) — the reference for the
source-view byte-identical dirty check. `editorBaseline` stays the editor's
serialization of the content it parsed (now the body). `openFile`, `RELOAD`,
`SAVE_SUCCESS` and `REFRESH_FROM_SOURCE` all split the full text and store both
parts (research R3).

**Save recombination.** `getContentToSave` returns
`joinFrontmatter(frontmatter, content)` for source view; for a clean formatted
document it returns `joinFrontmatter(frontmatter, content)` — the raw body
bytes, so a no-edit save writes the original bytes exactly; for a dirty
formatted document it returns `joinFrontmatter(frontmatter, editorSerialization)`.
With no frontmatter, `joinFrontmatter('', body)` is just the body — no empty
block is ever added (FR-010).

**Source view shows the full file.** `EditorPanel` passes
`joinFrontmatter(frontmatter, content)` as the `SourceView` value, and
`CrepeHost` still receives `content` (the body). Source edits arrive as full
text; `UPDATE_CONTENT`'s source branch re-splits it into frontmatter + body and
checks dirty against `baseline` (the full-file bytes). This makes the
re-extraction required by FR-007 happen continuously while editing in source.

**Return-to-formatted.** `handleReturnToFormatted` compares the live editor
serialization against `content` (the body). If only the frontmatter changed in
source, the body is unchanged so no remount happens and the already-stored
frontmatter is current. If the body changed, `REFRESH_FROM_SOURCE` is dispatched
with the full recombined text; the reducer re-splits so any frontmatter edit
survives the remount too.

**Delimiter rules.** A delimiter line is a line whose content is exactly `---`
(optionally `\r`-terminated for CRLF files). The opening delimiter must be the
very first line of the file. The closing delimiter is the next `---` line. If
there is no closing `---`, the whole file is body (edge case). The split is a
byte partition — `frontmatter + body === original` always — so a no-edit save
is byte-identical.

## Project Structure

### Documentation (this feature)

```text
specs/021-frontmatter-handling/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R-Process decisions
├── data-model.md        # DocumentState.frontmatter field
├── quickstart.md        # Manual verification script
├── contracts/
│   └── frontmatter.md   # Pure-domain contract + unchanged IPC note
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/
├── domain/frontmatter.ts          # NEW: pure splitFrontmatter / joinFrontmatter
├── domain/dirty.ts                # getContentToSave recombines frontmatter + body
├── state/documents.ts             # + frontmatter field; split/join in openFile, UPDATE_CONTENT (source), SAVE_SUCCESS, RELOAD, REFRESH_FROM_SOURCE
├── editor/EditorPanel.tsx         # SourceView value = frontmatter + content
├── hooks/useSourceViewToggle.ts   # handleReturnToFormatted passes full recombined text to REFRESH_FROM_SOURCE

tests/
├── renderer/
│   ├── frontmatter.test.ts        # NEW: split/join unit tests (every edge case)
│   └── documents.frontmatter.test.ts  # NEW: reducer + getContentToSave frontmatter flows
└── e2e/
    └── frontmatter.spec.ts        # NEW: US1–US4 acceptance scenarios against the built app
```

**Structure decision**: the feature lives inside `src/renderer` only; the split
logic is a pure domain module next to the existing `domain/dirty.ts`, and the
reducer/editor changes mirror the existing `view`-field plumbing from spec 002.

## Phase status

- Phase 1: Setup (fixtures for frontmatter round-trip files)
- Phase 2: Foundational (domain/frontmatter.ts + unit tests)
- Phase 3: US1 — open: split on load, visual editor gets only the body
- Phase 4: US2 — save: recombine frontmatter + body; no-edit save byte-identical
- Phase 5: US3 — source view: full file, frontmatter edits preserved across view switches
- Phase 6: US4 — round-trip fidelity (byte-identical)
- Phase 7: Polish — lint, typecheck, unit + e2e, spec archive, status table

## Deferred / later features

- YAML parsing/validation (explicitly out of scope — frontmatter is opaque)
- Editing frontmatter through a dedicated visual UI (spec assumption: source view only)
- Multiple frontmatter blocks
- Delimiters other than `---` (e.g. Hugo's `+++`)

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| `content` means "body" while source view still displays and edits the full file (frontmatter + body) | The visual editor must see only the body while source view must see everything; the split/join is the single seam that keeps both true without an editor instance per view | Keeping `content` as the full file and stripping frontmatter only at the CrepeHost boundary — the editor's serialization would then re-introduce body-only text into the full-content slot on every formatted edit, losing the frontmatter |
