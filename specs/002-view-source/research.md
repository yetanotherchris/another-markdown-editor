# Research & Technical Decisions: View Source

**Feature**: `002-view-source` | **Date**: 2026-08-02

Every decision below was verified against the installed package sources in this
repository (crepe 7.21.3, `@milkdown/kit` 7.21.3, `react-arborist` 3.16).
CI/UI evidence is noted where the decision depends on a non-obvious library
behaviour. Decisions marked `R-fix` amend a mistake discovered during
implementation and are duplicated into the plan's decision log.

## R1 — Source view is a plain `<textarea>` inside each document's editor host

**Decision**: Each document keeps its existing `.editor-host` container. When
`document.view === 'source'`, that container renders the formatted
Crepe instance hidden (`visibility: hidden`, still mounted so its editor and
undo/scroll survive) plus an absolutely positioned `.source-view` panel with a
compact toolbar and a plain, spell-checked, monospace `<textarea>`.

**Rationale**: The spec (FR-007) explicitly requires a plain-text editor with
no syntax highlighting. `@milkdown/crepe` has no `setMarkdown`, so the formatted
editor cannot be *reused* as a text buffer anyway (R1 of the parent feature). A
`<textarea>` is the lowest-complexity component that meets the requirement and
maps 1:1 to the reducer's `content` string.

**Alternatives considered**: CodeMirror/Monaco (rejected — new heavyweight
dependency for a "no highlight" requirement; constitution: dependencies MUST be
justified); a second Crepe instance in a collapsed/plain mode (already needs a
mount + has no raw-text surface).

## R2 — Views share the same document content and dirty state

**Decision**: Both views read/write `DocumentState.content`. WYSIWYG updates
already arrive through `UPDATE_CONTENT` (via the listener's debounced
`markdownUpdated`). Source view dispatches `UPDATE_CONTENT` with its textarea
value on every change. The reducer's dirty flag is view-aware (2026-08-03
fix): source documents keep `dirty = content !== baseline` (raw bytes), while
formatted documents compute `dirty = !markdownSame(content, editorBaseline)`.
The formatted content slot holds the editor's serialization, which always
appends a single trailing newline and normalizes EOLs, so a strict comparison
against the raw baseline marked an edit→undo back to the original as dirty.
Comparing against the editor's own baseline (which already absorbed that
normalization) keeps "returned to original" clean and still flags real edits —
it is the reducer-side equivalent of the live-dirty guard (late addition
2026-08-03). A source edit marks the tab dirty exactly like a formatted edit,
and the existing save/close/quit/external-change guards apply unchanged.

**Saved bytes**: while a tab shows source, `getContentToSave` returns the raw
`document.content` rather than `crepe.getMarkdown()`, so Ctrl+S writes the
exact text the user typed (empty-file / no-trailing-newline / 10,000-line
edge cases keep their bytes — the spec's edit is "without gratuitous content
changes"). When the tab is in formatted view the existing
`instancePool.getMarkdown` path is kept.

**Alternatives considered**: rerouting source edits first through a Crepe
instance (throws away raw text; reparse-only normalization is unwanted).
Recording the buffer in a second `DocumentState` field (two sources of truth
that can already diverge and must be merged; more code, no benefit).

## R3 — Switching views: who migrates what

Crepe accepts content only at construction (`defaultValue`) and exposes no
`setMarkdown` (R1 of 001). This forces the two transitions to be handled
differently:

- **formatted → source**: momentarily `flushLiveContent()` for that document
  (the reducer flag lags Crepe's 200 ms listener debounce), then render the
  textarea with `document.content`. The Crepe instance stays mounted as-is.
- **source → formatted**: read `document.content` (the source text). Compare
  with the live Crepe instance's `getMarkdown()`.
  - **Equal** → simply switch visibility. Editor, undo history, cursor and
    scroll are all preserved (Principle IV) and no content migrates.
  - **Different** → the formatted editor must show the new text. Crepe can
    only take it at construction, so dispatch a **`REFRESH_FROM_SOURCE`
    reducer action** that bumps `contentVersion` (the existing remount key,
    already used by `RELOAD`) and resets the cursor; `EditorPanel` remounts
    CrepeHost with `document.content` as `defaultValue`. `baseline` and
    `dirty` are untouched — the document stays unsaved.

**Dirty-state caveat**: the reducer's dirty flag already lags the WYSIWYG
content by the debounce. During the source transition the
`flushLiveContent()` uses `instancePool.getMarkdown`, which only sees
formatted editors. `flushLiveContent` must therefore branch on `viewMode` and,
for source tabs, treat `document.content` as live (it already is, because each
keystroke is dispatched synchronously). Result: close/quit/delete guards stays
correct in both views (FR-013).

## FR2 note — how "cannot be represented" is handled securely

**Decision**: The raw source is never discarded — it is retained in
`document.content` and remains the save payload in source mode. When returning
to formatted, `REFRESH_FROM_SOURCE` bumps `contentVersion` so the editor
remounts with the source bytes; a round-trip check (`editorMatchesContent`)
decides whether a remount is needed at all.

**Deferred (2026-08-03)**: the quiet in-context banner (*"The visual editor
normalises some of this document's markdown…"*) that previously implemented
FR-12's "explain in context" branch was removed because the visual editor
normalises markdown as a matter of course and the notice fired on almost every
round trip. The preservation branch (raw text kept in `content` and in the
source view, never destructive) is unchanged. Re-add a quieter, material-drift-
only cue if writers report confusion (see the deferred note under FR-012 in
spec.md).

## R4 — the entrance animation: pure CSS, reduced-motion aware

**Decision**: `.source-view` mounts with a CSS `@keyframes slide-in-right` that
animates `transform: translate3d(100%, 0, 0) → translate3d(0,0,0)` over
160 ms (cubic-bezier easing) so the source view visibly *slides in from the
right* over the formatted editor (FR-3). Because the panel is positioned
absolutely to cover the editor host, only the entrance animates — the WYSIWYG
host remains mounted beneath the source layer. Returning to formatted is a
standard, non-animated view change (per the spec's presentation scope).

- `@media (prefers-reduced-motion: reduce)` sets the animation to `none`
  (constitution IV: calm, predictable editing).
- The animation runs only on the first mount of a tab's source view, not on
  later tab switches (the source panel stays mounted once created), so
  switching tabs mid-transition (edge case) settles on one complete view with
  intact content.

**Alternatives**: a JS-driven transition / `framer-motion` (new dependency,
no benefit); a `transition` + `visibility` correction (needs separate
measurements, equivalent complexity; keep the mount animation simpler).

## R5 — Explorer "View source" opens directly, without a duplicate tab

**Decision**: add `onViewSource(node)` to the tree. App handler behaviour
follows FR-004/005/006:

1. If a workspace markdown file is un-open: `window.api.readFile` then
   `OPEN_EXISTING` and dispatch `SET_VIEW {id, view:'source'}` in the same
   handler (React batches — the tab's very first paint is already source, so
   no WYSIWYG flash).
2. Already open in formatted: `OPEN_EXISTING` reactivates the tab (dedup),
   then `SET_VIEW{source}` → slide transition over a formatted tab (FR-3
   because the instance already shows it).
3. Already open in source: `OPEN_EXISTING` only activates the existing tab;
   skip `SET_VIEW` (no duplicate tab, no content churn; FR-014/FR-6).

Deduping stays keyed on `path` in the reducer (`OPEN_EXISTING`); no new IPC
is needed — `readFile`/`openFolder` already return workspace-relative paths
(contracts unchanged).

## R-Explorer — the active-tab highlight follows the tab, not the click

**Decision**: highlight = `workspace.selectedId`; this is already the grand
source of `react-arborist`'s `selection`. When the active tab changes, App:

- if the active document has a `path` that exists under the workspace:
  - open its parent chain (`treeApiRef.openParents(path)`, which lazily loads
    children through the existing `onToggle`), reveal the row
    (`scrollTo`) and dispatch `SELECT {id: path}`; otherwise keep the
    click/activate tree selection as-is.
- if the active document has no path (untitled/external) → dispatch
  `SELECT {id: null}` (stale highlight must be cleared, FR-021).

That matches the spec's targeting: *"The explorer highlight identifies the
file represented by the active tab, not the most recently clicked tree item."*

**No changes needed to `workspace.ts`**: selection is an existing
`selectedId` concept; only the *driver* differs.

## WG — toolbar tooltips (FR-15 / SC-006)

**Finding**: `crepe`'s TopBar renders each item with
`renderButton(item)` which builds `<button class="top-bar-item">` with **no
title and no aria-label** (verified: `feature/top-bar/index.js` lines
676–686, `TopBarItem` = `{ active, icon, selector?, onRun }`). The heading
selector is `.top-bar-heading-button` and also has no label. So FR-15 requires
new code, not just testing.

**Decision**: after Crepe mounts, assign each control a **tooltip AND
aria-label** through a stable, order-based mapping (the face items are
deterministic given the fixed feature set `[Toolbar]: false, [BlockEdit]:
false, [TopBar]: true`). We select all `.top-bar-item` buttons plus the
`.top-bar-heading-button` in DOM order: heading selector, then
bold/italic/strikethrough/code, bullet-list/ordered-list/task-list, link,
image, table, code-block, math, quote, hr, and finally the custom
`view-source` button. Because the heading selector renders its own
`.top-bar-heading-button` element first, the mapping indexes the concat of
`[headingButton, ...itemButtons]`.

The mapping is centralised in `renderer/toolbarLabels.ts` so it can be kept
in sync and unit-tested. The e2e suite asserts `title` and `aria-label` on
each top-bar control of a live editor.

> **Verified during Phase 002 implementation (2026-08-02):** the current map
> descends straight from the comment block above it in `toolbarLabels.ts`:
> **16** entries (heading selector + bold/italic/strikethrough/code,
> bullet/ordered/task-list, link, image, table, code-block, math, quote, hr,
> view-source). Crepe keeps ImageBlock/Table/Latex at their feature defaults
> (`[Toolbar]: false, [BlockEdit]: false, [TopBar]: true` does not turn them
> off), so all 16 controls render. An earlier 13-entry draft misaligned the
> map: "View source" landed on the math button and the real trailing button
> was unlabelled. Also, the source overlay must sit above the sticky top bar
> (`z-index: 20` in App.css — Crepe's `.milkdown-top-bar` uses `z-index: 10`),
> or the toolbar intercepts pointer events over the overlay.

## R-7 Creator button — adding "View source" to the WYSIWYG toolbar

**Decision**: pass `featureConfigs: { 'top-bar': { buildTopBar(b) {
… } } }` to the Crepe constructor. `getGroups` calls `buildTopBar(groupBuilder)`
**after** it has populated the default groups (verified, index.js line 581),
so `b.addGroup('view', 'View').addItem('view-source', { icon, active()=>false,
onRun(ctx) => onRequestViewSource() })` appends a trailing button in its own
group. A plain text label is chosen for the button icon since anchor SVG
strings render fine; a `title`/`aria-label` (via toolbarLabels) identifies it.

`buildTopBar` runs in the same context as `getGroups`, needs `ctx` at render
selection time (item `onRun` receives `ctx`); it does not need the prose view,
cleanly calling back into React via a prop of the host.

## R-Task for the task-list Backspace fix (FR-017)

**Observation**: the task item is the `list_item` node with a `checked`
attribute (`taskListItemSchema`). There is no visible "checkbox char" —
pressing Backspace at the start of an *empty* first item hits nothing
to delete and leaves the item (a checkbox that "cannot be removed"), which is
exactly the bug FR-017 claims.

**Decision**: bind a `keydown` handler on the `.ProseMirror` element inside
`CrepeHost` (`view.dom`, capture ) that intercepts `Backspace` only when:

- the selection is a collapsed text selection,
- `$from.parentOffset === 0` (cursor at the start of the paragraph),
- `$from.node(-1)` is a `list_item` with `attrs.checked != null` (i.e. it's
  the extended task variant, not a plain bullet/numbered item),
- the item has no text (`item.textContent.length === 0`).

When matched: `preventDefault()` and dispatch the removal transaction:

- **only child** of its list → replace the entire list node with a paragraph
  and move the cursor into it (FR-017 "the task-list structure is removed").
- **otherwise** → remove that one item (FR-016), leaving the siblings
  coherent.

To keep any "ordinary text deletion" intact (FR-018), all other Backspaces
fall through without ever touching this handler — the milkdown/prosemirror
defaults keep everything else. The decision logic is split into a small pure
helper `planTaskBackspace(state)` (unit-tested in `tests/renderer/
taskBackspace.test.ts` building a real ProseMirror state from the document
schema helpers) while the DOM-level wiring stays in CrepeHost.

A `Backspace` at the start of an empty item that is *not* first in its list is
treated the same as the multi-item case (FR-016: remove the item). We restrict
the trigger to `parentOffset === 0` and an empty item body, and a task item
nested inside another list's preceding content is excluded because the cursor
is not at the start of the item's own paragraph under those conditions — no
nested-list deletion risk.

## R-Process model — still no new IPC

The feature touches only the renderer (documents/editor/tree state) and
`App.tsx` glue. The main process and IPC contract are unchanged (the
explorer's View source action uses the existing `file:read` +
`OPEN_EXISTING` path; `getLiveContent`/`getContentToSave` branching happens
inside the renderer). This keeps security review surface minimal for the
feature.

## R-Live — the editor baseline separates normalization from real edits (2026-08-03)

**Observation**: `isDirtyLive` compared the live editor serialization against
the raw disk `baseline` with only trailing-newline/EOL tolerance. Crepe
normalizes markdown (autolinks, loose pipes, entities), so a *pristine*
normalising file appeared to have unsaved changes: closing or quitting prompted
"save?", and saving from the formatted view rewrote the file with the
normalized bytes — violating SC-006's byte-identical open/save guarantee. The
same false signal surfaced when switching to view source and back.

**Decision**: compare against the editor's OWN baseline instead. New
`DocumentState.editorBaseline` stores the editor serialization captured right
after it parses the current content (`CAPTURE_BASELINE` fires on every
CrepeHost mount) and is refreshed by `SAVE_SUCCESS`/`RELOAD`/
`REFRESH_FROM_SOURCE`. Then:

- `isDirtyLive(doc) = doc.dirty || (view==='formatted' && live ≠ editorBaseline)`.
  A pristine normalising file is clean (live === editorBaseline); a real
  keystroke drifts live from the baseline and is caught even inside the 200 ms
  debounce window. Source-view documents short-circuit to `doc.dirty` because
  their store content is always current and the mounted editor serializes stale
  pre-source-edit text.
- `getContentToSave(doc)` writes `document.content` (raw bytes) for a clean
  document, and the editor serialization only when `isDirtyLive` — so a no-edit
  open/save is byte-identical and the 200 ms window never drops a keystroke.

**Alternatives rejected**: comparing against the raw `baseline` (false dirty for
every normalising file — the observed bug); adopting the editor serialization
into `content`/`baseline` (destroys the raw-bytes policy and byte-identical
saves); a live-dirty flag derived in the pool (loses reducer purity and test
coverage — the store field is unit-tested).

## R-Open — the explorer "Open" action (US7, 2026-08-03)

**Decision**: the file context menu gains an Open item directly above View
source. App handling mirrors `openPathInSource` in reverse:

1. Already open (live): `ACTIVATE` the existing tab; if it shows source view,
   run the same `handleReturnToFormatted` path the source toolbar uses (so
   unsaved source edits migrate via `REFRESH_FROM_SOURCE` and nothing is
   discarded).
2. Not open (or evicted): `readFile` → `OPEN_EXISTING {view:'formatted'}`
   (the explicit view flips a reopened evicted tab that had been in source view
   back to visual editing).

Confirmed 2026-08-03: activating an already-open formatted tab is desired, not a
literal no-op. No IPC or main-process change.

## R-Context for performance note

- source textarea → a large 10,000-line file renders fine in a `<textarea>`;
  no parse on the normal keystroke path; `UPDATE_CONTENT` dispatch is a
  reducer write + dirty compare — cheap.
- formatted → source capture `flushLiveContent` reads one instance at most
  per switch.
- The remount on migrated source only remounts *that* tab's CrepeHost, not
  the pool others.

## Decisions validated against the constitution

| Principle | Check |
|-----------|-------|
| I. Process isolation | New renderer code only. `View source` reads still go through `readFile` IPC; no main-process or preload change; no node imports. |
| II. Path safety | No path handling changed (only tree path ↔ selectedId mapping; all real file operations still cross the main-process guard). |
| III. No data loss | Source edits → reducer (content unchanged); any view switch syncs live content before deciding; FR-12 note branch: raw text always retained; save of a source tab writes raw `.content`. |
| IV. Calm | No sync work on keystroke; view migration is instantaneous when no migration is needed; the slide is the only animation and respects reduced motion; tooltips are quiet; the banner is a surface, dismissible note. |
| V. Test what can corrupt/escape | Renderer reducer tests (new `view` field, `SET_VIEW`, `REFRESH_FROM_SOURCE`), `planTaskBackspace` unit tests, toolbar label tests, and a Playwright e2e suite covering all six user stories plus the edge cases. |