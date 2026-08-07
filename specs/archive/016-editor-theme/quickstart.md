# Quickstart: Editor Theme

**Feature**: 016-editor-theme | **Date**: 2026-08-07

Runnable validation guide proving the feature works end-to-end. For the design
rationale see `research.md`; for the field/transition details see `data-model.md`
and `contracts/renderer.md`.

## Prerequisites

- Node + npm installed.
- `npm install` run at the repo root.

## Fixture

Create a scratch folder `~/et-check/` containing:

`~/et-check/post.md`:

```markdown
# Heading

Body paragraph with `inline code` and a [link](https://example.com).
```

## Commands

### Unit tests (settings validation + theme list)

```sh
npx vitest run tests/main/settings.test.ts tests/renderer/editorThemes.test.ts
```

Expected: all pass. The first pins `editorTheme`'s closed-union validation,
default, and migration; the second pins the five-name list and its labels.

### Typecheck, lint, full unit suite

```sh
npm run typecheck
npm run lint
npm run test
```

Expected: clean. The pre-existing suites must still pass unchanged — the new field
defaults to `'rustic'`, so old configs load identically, and `editorFont` remains
a valid (inert) persisted field.

### E2E (builds, then launches Electron via Playwright)

```sh
npm run test:e2e -- editor-theme
```

Expected: the editor-theme spec passes, exercising the acceptance scenarios of
spec 016 against the real built app. Then run the full suite:

```sh
npm run test:e2e
```

Expected: green — including the updated `settings.spec.ts` (Editor Theme group
replaces the font group) and `theme.spec.ts` FR-010 (Rustic canvas no longer
darkens in dark mode).

## Manual walkthrough (dev)

```sh
npm run dev
```

1. **US1 — choose + Save**: Open Settings → Editor Theme. Select **Scholarly**,
   press **Save**. The canvas immediately becomes white with blue `#00B0E9`
   headings and an Arial/Helvetica-like body. Reopen Settings — **Scholarly** is
   checked. Selecting a theme and closing with the X (no Save) leaves the canvas
   exactly as it was.
2. **US2 — persistence**: With **Scholarly** saved, quit and relaunch. The canvas
   opens in Scholarly. Read the config file
   (`%APPDATA%/ame/config.json`, or your `AME_CONFIG_DIR`) — `.settings.editorTheme`
   is `"scholarly"`.
3. **US3 — Rustic default**: Wipe the config (or point `AME_CONFIG_DIR` at a fresh
   dir). The canvas is the warm off-white `#fffdfb` with a sans-serif (Inter) body
   and monospace inline code.
4. **US4 — serif variant**: Switch to **Rustic Serif** and Save. The same warm
   canvas now renders body and headings in a serif (Georgia) face.
5. **US5 — Monotone follows the app theme**: Set app Theme to **Dark**, then select
   **Monotone** and Save. The canvas is white-on-black. Set app Theme back to
   **Light** — black-on-white. Switch app Theme to **System default** and toggle
   your OS light/dark mode: the canvas follows live.
6. **US6 — Scholarly**: With **Scholarly** active, verify white background, blue
   headings (`#00B0E9`), a Helvetica-like body distinct from Inter, and the same
   monospace inline code as the other themes.
7. **FR-014 — documents untouched**: Type text into a document, switch editor
   themes repeatedly, and verify the content, the dirty marker, and undo (Ctrl+Z)
   are unaffected.

## Expected outcomes

- A theme change applies within 5 seconds and without restart (SC-001).
- The choice persists across restarts (SC-002).
- A missing/malformed/unknown theme value opens Rustic, app fully usable (SC-003).
- Monotone matches the resolved app theme and follows OS switches live (SC-004).
- Each of the five themes renders its specified values (SC-005).
- Theme changes leave content, dirty state, and undo history unchanged (SC-006).
