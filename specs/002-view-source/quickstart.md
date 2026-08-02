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

## 3 — US2/US7: open a file straight into source, or via Open

1. Right-click `b.md` in the explorer → **View source**.
2. Expected: `b.md` opens in a new active tab in source view (no formatted
   flash). Reopening the same file from the tree's *view source* activates the
   existing tab (no duplicate tab).
3. Right-click `b.md` → **Open** → the WYSIWYG shows in a new/active tab;
   right-click → **View source** → existing tab slides to source.
4. Put `b.md` in source view, then right-click `b.md` → **Open** → the tab
   returns to visual editing (no duplicate tab).

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

## 8 — edge: representable round trip stays clean

Open a doc whose raw markdown Crepe normalises (e.g. an https autolink), switch
to source and back WITHOUT editing. Expected: no dirty dot, no close/quit
"unsaved changes" prompt, and the source text stays raw. Save without editing
and the file on disk is byte-identical. (A visual-editor-normalises banner no
longer appears — see the deferred note under FR-012 in spec.md.)

## 9 — e2e does not steal focus

`npm run test:e2e` launches Electron with Chromium's `--headless` switch, so no
window appears on screen. Set `AME_E2E_HEADED=1` to run with a visible window
when debugging.

## Automate

```text
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```