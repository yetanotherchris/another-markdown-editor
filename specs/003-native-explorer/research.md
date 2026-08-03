# Research & Technical Decisions: Native Explorer

**Feature**: `003-native-explorer` | **Date**: 2026-08-03

Every decision below was verified against the installed packages and this
repository (lucide-react 1.28, @fontsource/inter 5.3, crepe 7.21.3,
react-arborist 3.16, react 19, electron-vite 5).

## R1 — Lucide is the icon set

**Decision**: `lucide-react` is the single cohesive icon set (FR-001).
Rendered as inline `<svg>` components, so no font-icon service and no network
(FR-007).

**Why this set**: Lucide is the ISC-licensed, tree-shakable descendant of the
Feather icon project, and is the icon language used by the desktop note-taking
apps the spec's "similar to Obsidian/OpenCode" wording points at. It ships React
components (`<Folder/>`, `<FolderOpen/>`, `<FileText/>`, `<ChevronRight/>`,
`<ChevronDown/>`, `<Plus/>`), each an inline SVG, so offline rendering is
guaranteed and no font file is involved.

**Alternatives considered**: `react-icons` (bundles many sets, larger); a
hand-rolled SVG module (not a "single cohesive set" with a permissive licence
and maintainers); emoji (FR-002/003 explicitly reject the current look).

## R2 — Inter via @fontsource, bundled locally

**Decision**: `@fontsource/inter` supplies the OFL-1.1 Inter typeface as
self-hosted woff2 assets. Import the CSS in `main.tsx` (`400.css`, `600.css`);
electron-vite resolves the `url(./files/*.woff2)` references into the renderer
build output, so the font ships inside the app and needs no network (FR-006/007).

**Applying it**:
- `html, body` get `font-family: 'Inter', -apple-system, ...` (the chrome —
  toolbar, tree, tabs, footer — inherits).
- The Crepe editor canvas is themed via its own CSS variables: overriding
  `--crepe-font-default` and `--crepe-font-title` on `.milkdown` makes editor
  body and heading text use Inter too, giving the "clean desktop-editor
  appearance" of FR-006. (Verified: crepe classic.css → `lib/theme/crepe/
  style.css` defines these two variables; `reset.css` consumes them.)

**Kept monospace**: the source textarea from spec 002 stays monospace — it is
the raw-bytes editing surface, not interface chrome (research R-Process of 002).

## R3 — Footer derives everything from existing reducer state

**Decision**: the footer is a pure render of state that already exists:

- Left = `activeDoc.title` (+ dirty `•` when `dirty`). `activeDoc` is already
  computed by `getActiveDocument(session)`.
- Right = `workspace.root` (newly populated, R-Path) or its `shortenPath` form.

No new reducer, no new actions, no extra IPC on the tab-switch or open/close
path. FR-012 ("updates or clears promptly when a document or workspace is
opened, closed, replaced, renamed, or made unavailable") falls out for free:
every one of those transitions already dispatches a reducer action that changes
`activeDoc` or `workspace`, so the footer re-renders in the same frame.
FR-011 (no active-file display in the header) is satisfied by removing the
`.document-title` span from `.toolbar`.

**`.document-title` class retention**: prior-phase e2e suites
(`app/tabs/source/organize.spec.ts`) locate the active-document label via
`.document-title` and assert its title/dirty text. Keeping that class on the
footer's left span preserves all of them while moving the element (FR-011). No
test asserts the span lives *inside* `.toolbar`.

## R4 — shortenPath: deterministic, width-driven, final-folder-first

**Decision**: a pure `shortenPath(path, maxLength)` helper:

```text
if path.length <= maxLength → path unchanged
else:
  split on '/' or '\'; walk segments from the END, prepending each while the
  candidate (including a leading '…' + separator) stays within maxLength;
  always include the final segment whole; prefix with '…' + separator
  (the final folder name is never split).
```

This is "an unambiguous shortened form that keeps the final folder name visible"
(FR-010). It is deterministic and unit-testable (Principle V), unlike CSS
`text-overflow` alone, which clips the *tail* (the opposite of what we need).

**Width driving**: the footer measures its workspace span with the existing
`useElementSize` hook (ResizeObserver). `maxLength = max(finalFolderLen + 3,
floor(widthPx / 8))` — the `/8` is a conservative character width estimate for
Inter at the footer's ~12px; the final-folder floor guarantees the folder name
always survives even at tiny widths. Recomputes on resize; nothing runs on the
keystroke path (Principle IV).

## R-Path — the workspace root path is added to the open-folder response

**Finding**: `WorkspaceInfo` was `{ name, entries }`. The renderer never
received the workspace's absolute path, so a footer could not show "the
workspace's full location" (FR-010). `WorkspaceState.root` already existed but
was always `null`.

**Decision**: add `path: string | null` to `WorkspaceInfo`. The main
`workspace:openDialog` handler returns `path: workspaceRoot` (the realpath it
already resolves); both `REPLACE` dispatches in `App.tsx` now populate
`root` from it.

**Security posture (Principle II)**: this is display-only. The renderer never
feeds this string into `readFile`/`writeFile`/etc. — every fs operation still
goes through main's `resolveWithinRoot`. The value is the workspace root the
user *chose*, not an arbitrary path, and it is already the reference point of
the workspace-relative paths the renderer handles every day. Adding it to a
successful open-folder result does not widen the trust boundary. No new channel;
a preload change is unnecessary (the type flows through `WorkspaceInfo`).

**Alternatives rejected**: reconstructing the path renderer-side from
`workspace.name` (no absolute info exists in the renderer); showing only the
folder name (fails FR-010's "full location when space permits"); a separate
`workspace:getRoot` channel (unnecessary — the dialog already returns the info).

## R-Focus — accessibility of the new chrome (FR-013)

- Decorative tree icons and toolbar icons: `aria-hidden="true"`; the visible
  text label ("New", "Open Folder") is the accessible name, so keyboard/screen
  reader users get the purpose (US2 acceptance 3).
- The expand/collapse toggle stays `role="button"` with `aria-label` "Expand" /
  "Collapse" (already present) and gains a `:focus-visible` ring.
- The footer is informational; left/right regions are plain text with a muted
  placeholder when empty, and the right region exposes the full path as a
  `title` tooltip.
- All font sizes/colors keep AA contrast against the existing light theme.

## Decisions validated against the constitution

| Principle | Check |
|-----------|-------|
| I. Process isolation | Renderer-only chrome + bundled static assets. The single main change is an additive field on an existing dialog response. |
| II. Path safety | No fs path handling changes; the new root string is display-only and never used for I/O. |
| III. No data loss | No save/close/quit/delete paths touched. |
| IV. Calm | Footer derives from state (no new work on switch); shortening is resize-driven, not keystroke-driven. |
| V. Test what can corrupt/escape | shortenPath unit tests, workspace root/IPC shape tests, full e2e at tests/e2e/native.spec.ts. |
