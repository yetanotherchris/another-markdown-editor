# Quickstart: View Source

**Feature**: `002-view-source` | **Date**: 2026-08-02

Manual end-to-end validation of the feature. Runs against `npm run dev`.

Prerequisites: a workspace folder with two `.md` files (e.g. `a.md`
containing `# Hello\n\nSome *bold* text.`, `b.md`; plus a subfolder
`notes/` with `deep.md`).

## 1 — US1: slide into source view from the toolbar

1. Open `a.md` (formatted view).
2. Click the **View source** button (right end of the Crepe top bar).
3. Expected: the raw markdown slides in from the right and covers the WYSIWYG
   editor; a compact source toolbar shows **Back to visual editing**; the tab
   bar still shows `a.md`.

## 2 — US1 edit → dirty → return

1. In source view, change the text (e.g. append a line).
2. Expected: the tab shows a dirty marker (●).
3. Press **Back to visual editing**.
4. Expected: the WYSIWYG now shows the edited content; the dirty marker stays.

## 3 — US2: open an unopened file straight into source

1. Right-click `b.md` in the explorer → **View source**.
2. Expected: `b.md` opens in a new active tab in source view (no formatted
   flash). Reopening the same file from the tree's *view source* activates the
   existing tab (no duplicate tab).
3. Right-click `b.md` → **Open** (normal) → the WYSIWYG shows; right-click →
   **View source** → existing tab slides to source.

## 4 — US3: return with and without edits

1. Open a doc in source and return without editing.
2. Expected: no remount blank — the formatted editor returns instantly with
   its previous content and no dirty marker.
3. Repeat after editing → expected: change present, dirty marker intact.

## 5 — US4: toolbar tooltips

1. In formatted view hover each top-bar control.
2. Expected: a tooltip (title) describing the control; keyboard focus also
   exposes it via `aria-label`.

## 6 — US5: empty task item Backspace

1. Click the **checklist** (task list) top-bar button, leave the item empty.
2. Press Backspace at the item start.
3. Expected: the empty task item disappears (and if it was the only item, the
   list structure disappears), leaving an editable position.

## 7 — US6: explorer active-file highlight

1. Open `a.md` and `b.md` in two tabs; switch between them.
2. Expected: the explorer highlights the file that the active tab shows, and
   it reveals (opens parents + scrolls) the highlighted file even inside
   `notes/`.
3. Create/activate an Untitled tab → the highlight clears.

## 8 — edge: representable round trip + FR-12 banner

Open a doc whose raw markdown Crepe normalises (e.g. an inline-HTML or
loose-lists fixture), Make an edit in source, return; if the round trip
differs, a quiet banner appears in the formatted view ("The visual editor
normalises some of this document's markdown…"). The source text is still
available when switching back and the document stays unsaved.

## Automate

```text
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```