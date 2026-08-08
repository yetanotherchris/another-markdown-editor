# Implementation Plan: Improved View Source Icon

**Branch**: `014-view-source-icon` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-view-source-icon/spec.md`

## Summary

The "View source" action in the formatted editor toolbar is currently rendered
by Crepe as a plain top-bar button with an outline-coloured code-chevron icon —
visually identical to every other formatting control, so it is easy to miss.
This feature makes the icon clearly distinguishable: the button keeps the same
icon family, size, alignment, label, tooltip, behaviour, transition, and
shortcut (FR-006/007), but its icon is rendered in the application's accent
colour (`--mm-accent`, orange in light theme, blue in dark theme) with a subtle
accent-tinted background so it reads as the prominent "switch to source" action
(FR-001/002/003/005). The accessible name and tooltip ("View source") are
unchanged (FR-004).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: `@milkdown/crepe` 7.21.3 (TopBar), React 19. No new dependencies.

**Storage**: none — a pure presentation change.

**Testing**: Vitest (renderer project) + Playwright e2e (`npm run test:e2e`).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), WYSIWYG markdown editor.

**Performance Goals**: none — static CSS and one SVG string; no runtime cost.

**Constraints**: Renderer sandboxed; the View source behaviour, transition, and
keyboard shortcut must not change (FR-007); the icon must stay in Crepe's
top-bar DOM so the existing label/tooltip pipeline (`toolbarLabels.ts`) keeps
working.

**Scale/Scope**: One toolbar button's presentation in the renderer + a new e2e
assertion.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Renderer-only CSS + SVG; no IPC, preload, or main-process change | **PASS** |
| II. Every Path Is Untrusted | No path handling touched | **PASS** |
| III. Never Lose The User's Words | No data or save paths touched; behaviour unchanged | **PASS** |
| IV. Calm, Predictable Editing | Presentation-only; no keystroke-path work, no reflow | **PASS** |
| V. Test What Can Corrupt Or Escape | No corruption/escape surface; e2e asserts the icon's distinctness and the preserved label/tooltip | **PASS** |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**Target the appended group, not a new API.** Crepe's `TopBarItem` type has no
per-item class, and `renderButton` hard-codes `class="top-bar-item"` (+ `active`).
The custom "view-source" group is appended last by `buildTopBar` (CrepeHost.tsx),
so the view-source button is always the last `.top-bar-item` inside
`.top-bar-inner` — targeted with `.top-bar-inner > .top-bar-item:last-child`.
This avoids forking Crepe and keeps the label pipeline (DOM-order match in
`toolbarLabels.ts`) intact.

**Accent icon + tinted background.** The button's `svg` is overridden to
`color: var(--mm-accent); fill: var(--mm-accent)` (the app's semantic accent
token, already theme-aware: `#d96b27` light / `#3794ff` dark) and the button
gets a translucent accent background
(`color-mix(in srgb, var(--mm-accent) 14%, transparent)`). This satisfies
FR-003 (deliberate, consistent accent usage) and FR-005 (works in both themes).

**Icon glyph unchanged.** The existing code-chevron path already communicates
"source/raw text" (FR-002); only its colour/prominence changes.

## Project Structure

### Documentation (this feature)

```text
specs/014-view-source-icon/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R4 decisions
├── data-model.md        # (none — no entities; contract note)
├── quickstart.md        # Manual verification script
├── contracts/
│   └── renderer.md      # View-source button presentation contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/editor/editor.css          # distinct view-source button rule
tests/e2e/view-source-icon.spec.ts      # NEW: accent colour + tooltip assertion
```

**Structure decision**: a CSS-only change in the existing editor stylesheet plus
one e2e spec; no component or icon source change needed.

## Phase status

- Phase 1: Setup — none required (CSS + e2e only)
- Phase 2: Foundational — the CSS rule (single task)
- Phase 3: US1/US2/US3 — e2e asserting distinctness + preserved labels
- Phase 4: Polish — gates, spec archive, status table

## Deferred / later features

- Restyling the "Back to visual editing" return button (spec Assumptions: out of scope)
- A different icon glyph (the current code-chevron already meets FR-002)

## Complexity tracking

None — no principle violated.
