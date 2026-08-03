# Quickstart: Native Explorer

**Feature**: `003-native-explorer` | **Date**: 2026-08-03

Manual end-to-end validation of the feature. Runs against `npm run dev`.

Prerequisites: a workspace folder with two `.md` files (e.g. `a.md`, `b.md`) and
a subfolder `notes/` with `deep.md`.

## 1 — US1: native tree icons

1. Open the folder.
2. Expected: folders show a folder icon that *changes* when expanded (closed →
   open glyph), files show a document icon, and every folder shows a clear
   chevron affordance (right when collapsed, down when expanded).
3. Expand/collapse `notes/` — the chevron flips and the row is still readable.

## 2 — US1: keyboard toggle

1. Tab into the tree (the tree is one Tab stop; the first Tab reaches it after
   the two toolbar buttons). The first row gains a visible focus ring.
2. Use Arrow Down/Up to move the ring between rows; the selected file's
   highlight stays on the last clicked row (selection and focus are separate).
3. On a folder row, press Space (or Arrow Right to expand / Arrow Left to
   collapse). Expected: the folder toggles and the focus ring stays visible.
4. Note: the chevron itself is mouse / screen-reader only — keyboard users
   toggle with Space/arrows on the focused row.

## 3 — US2: toolbar buttons use icons

1. Look at the header.
2. Expected: **New** shows a `+` icon and **Open Folder** shows an open-folder
   icon, both with their text label intact (accessible names "New" and
   "Open Folder").

## 4 — US3: footer shows the active document

1. Open `a.md`, then `b.md`.
2. Expected: the footer bottom-left shows `b.md` (the active tab), updating when
   you switch tabs; editing marks it dirty with `•`; the header no longer shows
   the document name.
3. Open an Untitled document → footer shows `Untitled-N`.

## 5 — US3: footer shows the workspace location

1. Open the workspace folder.
2. Expected: the footer bottom-right shows the folder's full path.
3. Resize the window very narrow → the path shortens to `…` + final folder; the
   full path is still available on hover (tooltip) and nothing overlaps the
   left region.

## 6 — edges

1. With no workspace open: footer right shows "No folder open".
2. With no document open: footer left shows "No document open".
3. Close the workspace via Open Folder → another folder: the footer updates to
   the new path immediately.

## 7 — US4: offline fonts and icons

1. Launch the app with network disabled.
2. Expected: Inter renders everywhere (no system fallback flash), and every
   icon above is visible.

## Automate

```text
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
