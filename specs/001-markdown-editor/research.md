# Phase 0 Research: Desktop Markdown Editor

**Feature**: `001-markdown-editor` | **Date**: 2026-08-01

Resolves the unknowns in the technical context and the open questions carried
over from `docs/DESIGN_DECISIONS.md` §7. Versions verified against the npm
registry on 2026-08-01.

## R1. Milkdown instance model: one shared, or one per tab

**Question** (DESIGN_DECISIONS.md §7): "Milkdown: one instance vs one per tab?"

**Decision**: One `Crepe` instance per open document.

**Evidence**. The public `CrepeBuilder` API surface in
`@milkdown/crepe@7.21.3` is:

```ts
constructor({ root, defaultValue }?: CrepeBuilderConfig)
create:      () => Promise<Editor>
destroy:     () => Promise<Editor>
get editor():   Editor
setReadonly: (value: boolean) => this
getMarkdown: () => string
on:          (fn: (api: ListenerManager) => void) => this
```

There is **no `setMarkdown` or equivalent**. Content enters the editor only
through `defaultValue` at construction time. A single shared instance would
therefore have to reach past Crepe into the underlying ProseMirror editor
(`crepe.editor.action(replaceAll(md))` via `@milkdown/kit/utils`) on every tab
switch.

**Why that is rejected**: `replaceAll` dispatches a transaction against the
existing editor state, so the *undo history is shared across documents*.
Undoing after a tab switch would revert an edit made in a different file — an
unacceptable failure of FR-017 and Principle IV. Preserving per-document cursor
and scroll position would also require manual save/restore against a document
that has just been wholesale replaced.

**Cost accepted**: Each instance carries a ProseMirror state, a view, and any
CodeMirror instances for its code blocks. Mitigated by capping live instances
(R2). Alternative rejected: a shared instance is cheaper in memory but cannot
satisfy FR-017 without reimplementing per-document history, which is strictly
more work and more risk than holding several instances.

## R2. Bounding editor instance count

**Decision**: Keep at most 8 live `Crepe` instances (LRU). Inactive instances
stay mounted but hidden via CSS. When the cap is exceeded, the least recently
used *clean* document is evicted: its markdown, cursor offset, and scroll
position are retained in the document store and `destroy()` is called.

Dirty documents are **never** evicted, because their content exists nowhere
else. If all 8 are dirty, no eviction occurs and the cap is exceeded rather
than risk Principle III.

**Rationale**: Bounds memory on a workspace where a user opens dozens of files,
while making eviction invisible in the common case. Undo history is lost on
eviction — an accepted, documented trade for clean documents only.

Rejected: destroying on every tab switch (loses undo history constantly);
unbounded instances (unbounded memory).

## R3. Hiding inactive editors

**Decision**: `visibility: hidden` + `position: absolute` on inactive editor
containers, not `display: none` and not unmounting.

**Rationale**: `display: none` collapses the element to zero height. ProseMirror
and CodeMirror cache layout measurements and mis-restore scroll position when
they are re-shown from a zero-size box. Keeping the element laid out avoids a
class of scroll-jump bug that would violate FR-017.

## R4. Dirty tracking

**Decision**: Subscribe via `crepe.on((listener) => listener.markdownUpdated(...))`.
Compare the emitted markdown against a stored baseline — the exact string last
read from or written to disk — and set `dirty = (current !== baseline)`.

**Rationale**: Comparing against a baseline rather than setting a one-way flag
means undoing back to the original state correctly clears the dirty marker.

**Caveat verified in Phase 5 — the "first emission" does not exist**: the
listener plugin (`@milkdown/plugin-listener`, inspected 2026-08-01) debounces
`markdownUpdated` by 200 ms and only records transactions with
`tr.docChanged`, and no doc-changing transaction fires on load. The first
emission therefore occurs on the user's *first edit* — capturing the baseline
from it would capture the edit itself, leaving the document permanently clean.
The baseline is instead read from `crepe.getMarkdown()` immediately after
`create()` resolves (the parsed, normalised content), and the `CAPTURE_BASELINE`
reducer action adopts it as both `content` and `baseline`, so a freshly opened
file is never falsely dirty. Verified end-to-end: every opened file previously
showed a dirty marker (Phase 5 e2e probe).

**Consequence — guarded actions must not trust the reducer alone**: because
the reducer's dirty flag lags keystrokes by the 200 ms debounce, the close-tab
and quit guards additionally read the live editor content
(`instancePool.getMarkdown(doc.id) !== baseline`) before deciding, and flush it
into the reducer. Without this, closing or quitting within 200 ms of the last
keystroke would discard the edit with no prompt — a Principle III breach.
Eviction likewise treats unflushed live content as dirty.

## R5. Markdown round-trip fidelity (FR-014, SC-006)

**Decision**: On save, if the document is not dirty, write nothing at all. When
dirty, write Crepe's `getMarkdown()` output.

**Rationale**: SC-006 requires that open-and-save without editing leaves the
file byte-identical. Crepe normalises markdown on parse — list bullets, emphasis
markers, and heading styles may all be rewritten. The only reliable way to
guarantee byte-identity for an unedited file is not to write it.

For an edited file, some normalisation is unavoidable and acceptable. A
characterisation test suite records what Crepe does to each supported construct
so that regressions are visible; constructs found to be *lost* rather than
merely reformatted are defects against FR-014.

**Risk flagged**: Raw HTML blocks and uncommon syntax are the likely failure
cases. This must be measured early — task ordering places it before the editor
is built out, because a discovery that Crepe drops content would materially
change the feature.

## R6. Path containment (FR-002, FR-003, Principle II)

**Decision**: A single `resolveWithinRoot(root, candidate)` function through
which every filesystem operation passes. Algorithm:

1. Reject non-strings, empty strings, and strings containing NUL.
2. Reject the candidate if `path.isAbsolute()` and it was supplied where a
   workspace-relative path is expected.
3. `path.resolve(root, candidate)` then `path.normalize`.
4. `fs.realpath` the result to collapse symlinks and junctions. If it does not
   exist, `realpath` the nearest existing ancestor and re-append the remainder
   (needed for create/rename targets).
5. `realpath` the root once at open time and cache it.
6. Confirm containment with `path.relative(realRoot, realTarget)` — accept only
   if the result is non-empty, does not start with `..`, and is not absolute.
   String `startsWith` is **not** used: `/foo/barbaz` starts with `/foo/bar`.
7. On Windows additionally reject reserved device names (`CON`, `PRN`, `AUX`,
   `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, with or without extension), trailing
   dots and spaces, and alternate data stream syntax (`file.md:stream`).

**TOCTOU**: The resolved real path from this function is the value passed to the
filesystem call. The unvalidated input is never used again.

**Rationale**: This is the application's entire security boundary. Centralising
it in one pure, exhaustively tested function is the only way to be confident
every one of the seven IPC operations is covered.

Rejected: prefix string matching (fails on sibling-prefix directories and on
symlinks); per-operation ad-hoc checks (guarantees an inconsistency).

## R7. Atomic writes (FR-021)

**Decision**: Write to a temporary file in the **same directory** as the target,
`fsync`, then `fs.rename` over the target.

**Rationale**: `rename` within a filesystem is atomic, so a reader sees either
the old file or the new one. The temp file must share the target's directory
because `rename` across filesystems is not atomic and fails with `EXDEV`; the
system temp directory is frequently on a different volume.

**Windows caveat**: `rename` over an existing file fails on Windows if the
target is open by another process with a sharing violation. The write path
therefore surfaces `EBUSY`/`EPERM` as a specific "file is locked by another
program" error rather than a generic failure, and leaves the document dirty per
FR-022.

**Cleanup**: The temp file is removed on failure. Temp names are prefixed
`.<name>.tmp-<random>` so a crash leaves an identifiable, hidden artefact.

## R8. Detecting external changes (FR-034 – FR-038)

**Decision**: `chokidar@5` in the main process, watching the workspace root for
the tree and relying on the same watcher for open documents.

**Rationale**: Node's raw `fs.watch` has materially different semantics per
platform (no recursion on Linux before recent versions, duplicate events on
Windows, rename reported as delete+create on macOS). chokidar normalises these.
It is a heavy dependency for a small job, which is an accepted cost given how
much platform-specific breakage it removes.

**Suppressing self-writes (FR-037)**: Before an application write, record the
target path in a short-lived suppression set. Clear the entry when the watcher
reports the change, or after a 2 second timeout. Additionally compare the
post-write `mtimeMs` and size against what the application just wrote; a match
means the event is ours and is dropped. Belt and braces, because a purely
time-based suppression window is racy on slow disks.

*Implementation status (2026-08-02, PR #9 review)*: the mtime/size comparison
and clear-on-event were never implemented; only the suppression set + fixed 2 s
window shipped. The window is now **sliding** (each suppressed event refreshes
its timestamp — R21), which closes the slow-disk leak; the mtime comparison
remains unimplemented and is not currently needed.

**Debounce**: 100 ms per path, since editors and sync tools commonly produce
several events per logical change.

## R9. Deletion to trash (FR-029)

**Decision**: Electron's `shell.trashItem(path)`, which returns a promise and
handles Windows Recycle Bin, macOS Trash, and freedesktop trash on Linux.

**Fallback**: On Linux without a freedesktop-compliant trash implementation
`trashItem` rejects. The application then reports that the item cannot be moved
to trash and offers permanent deletion as an explicit second confirmation,
satisfying FR-029a. It does **not** silently escalate to permanent deletion.

## R10. Theme

**Question** (DESIGN_DECISIONS.md §7): "Default Crepe theme / light-dark?"

**Decision**: Ship Crepe's `frame` and `frame-dark` themes, selected by
`nativeTheme.shouldUseDarkColors` with a manual override persisted in settings.

**Evidence**: `@milkdown/crepe@7.21.3` exports exactly six theme stylesheets:
`classic`, `classic-dark`, `nord`, `nord-dark`, `frame`, `frame-dark`.

**Rationale**: `frame` is the most neutral of the three families and pairs with
a plain application chrome. Both stylesheets are bundled and swapped at runtime;
they are static CSS, so the cost of shipping both is negligible.

## R11. Build tooling

**Decision**: `electron-vite@5` with three build targets (main, preload,
renderer), TypeScript `strict` throughout.

**Rationale**: Purpose-built for this layout. Handles the preload script's
special bundling constraints (must be CommonJS-compatible and cannot rely on ESM
interop in a sandboxed context), gives renderer HMR, and integrates with
`electron-builder@26` without custom glue. Not mentioned in DESIGN_DECISIONS.md,
which specified Electron and electron-builder but left the gap between them
unfilled.

## R12. Testing strategy

**Decision**: Vitest 4, two projects in one workspace.

| Project | Environment | Covers |
|---------|-------------|--------|
| `main` | `node` | Path containment (adversarial), atomic write, trash fallback, watcher suppression, IPC handler contracts |
| `renderer` | `jsdom` | Document store reducers, dirty tracking, tab lifecycle, close/quit guards |

**Not automated in this feature**: End-to-end Electron driving (Playwright).
The window, menu wiring, and Crepe rendering are verified manually against
`quickstart.md`. Justification: E2E Electron setup is substantial, and the
constitution directs test effort at what is silent and dangerous — path escape,
data loss, corruption — all of which are reachable in the `main` project without
launching a window.

**Crepe is not unit tested directly.** It is third-party, needs a real DOM with
layout, and testing it tests Milkdown rather than this application. The
round-trip characterisation suite (R5) tests the *contract* the application
depends on, which is the part that can silently corrupt a user's file.

## R13. Renderer carries both React and Vue

**Observation**: `@milkdown/crepe@7.21.3` depends on `vue@^3.5.20`; its toolbar,
slash menu, and tooltips are Vue components. The renderer therefore ships React
19 *and* the Vue 3 runtime.

**Decision**: Accept. Do not attempt to strip it.

**Rationale**: This is intrinsic to choosing Crepe, which
`docs/DESIGN_DECISIONS.md` fixes. The two runtimes do not interact — Crepe mounts
Vue into DOM nodes React does not manage. The cost is roughly 60 kB gzipped in a
desktop application with no download-size constraint. Worth recording so it is
not later mistaken for an accidental dependency.

**Consequence**: React must not attempt to re-render the DOM subtree Crepe owns.
The editor container is mounted once and left alone; React treats it as an
uncontrolled boundary.

## R14. Large folder performance (SC-005)

**Decision**: `readDir` is shallow — one directory level per call, children
fetched on expand. `react-arborist` virtualises rows, so only visible nodes
render.

**Rationale**: A recursive scan of a large notes folder blocks the main process
and would breach SC-005. Lazy expansion bounds the work to what is on screen.
Symlinked directories are not followed during traversal, which also disposes of
the symlink-loop edge case.


## R16. Lazy watch set (SC-005, FR-034)

**Decision change (2026-08-01)**: The workspace watcher no longer scans the
whole folder tree at open. chokidar starts with `depth: 0` (root level only);
deeper directories are added to the watch set lazily via `WorkspaceWatcher.addPath`
when the renderer reads them (`workspace:readDir` on expand) or when a document
inside them is opened (`file:read`, `file:openDialog`).

**Evidence**: Opening `Psychology-Notes` (7,195 files / 1,007 directories, 336
markdown) previously took **7.7 s** for chokidar's initial full-tree scan
(`depth: Infinity`) on Windows, during which the main process was saturated and
the app felt frozen. With `depth: 0` the scan settles in **102 ms**. The tree
already loads lazily (R14), so nothing visible is lost: an unexpanded folder's
contents are read fresh on expand, and open documents' parent directories are
watched explicitly, preserving FR-034–FR-038.

**Rejected alternative**: keeping `depth: Infinity` but filtering non-markdown
files via chokidar's `ignored` callback. readdirp still stats every entry
(`alwaysStat: true`) before the filter runs, so the scan cost is not avoided.
## R15. Deferred

| Item | Status |
|------|--------|
| App id, product name, `.md` file association | Deferred — packaging, out of scope per spec Assumptions |
| Auto-update from GitHub Releases | Deferred — needs code-signing decision first; `electron-updater` is painful unsigned on Windows and macOS |
| electron-builder / GitHub Actions | Deferred to a later feature per the agreed phase scope |

## R17. Editor scroll container (Phase 5)

**Decision**: The app's `.editor-host` wrapper (absolute, full-size,
`overflow: auto`) is the editor's scroll container and the cursor/scroll
capture target.

**Evidence**: prosemirror-view 1.42.2 (transitive via `@milkdown/kit`) has no
`scrollDOM` API (added in a later minor). Crepe itself sets no `overflow` on
its root — the container must be provided by the application, which R3 already
implied.

**Access**: the ProseMirror `EditorView` is obtained through
`crepe.editor.action((ctx) => ctx.get(editorViewCtx))` with `editorViewCtx`
imported from `@milkdown/kit/core` (re-export of `@milkdown/core`, same version
as `@milkdown/crepe`). Cursor is `view.state.selection.anchor`; restore clamps
to `doc.content.size` and uses `TextSelection` from `@milkdown/kit/prose/state`.
`@milkdown/kit` was added as a direct dependency in Phase 5 for these imports.

## R18. react-arborist row identity and editing API (Phase 6, PR #9 review)

**Question**: Why did inline-rename rows remount (resetting the caret), and
what does the lazy-load path depend on?

**Evidence (verified against installed sources, react-arborist 3.16.0,
react-window 1.8.11)**:

- Rows are keyed **stably by node id**: `default-container.tsx` uses
  `itemKey: (index) => visibleNodes[index]?.id || index`, and react-window
  passes an *index number* (only `Grid` uses the object form; arborist never
  uses Grid). The earlier "per-render object key" theory recorded in tasks.md
  was **wrong** and is corrected there.
- Rows remount when the **component type or render-callable identity**
  changes: `provider.tsx` calls `api.update(treeProps)` on every Tree render
  with fresh `renderRow`/`children` function identities, and a new component
  type per render forces React to unmount/remount every visible row. Fix:
  module-scope `Row` + `useCallback` for the children renderer and
  `disableDrop` (T079).
- The caret regression's actual mechanisms were interaction-based (mousedown
  bubbling to `node.handleClick`, dragstart hijack, focus reclamation); the
  input's stopPropagation + `draggable={false}` handles those, and the caret
  e2e test pins the behaviour.
- Editing API: `node.edit()` returns `{ cancelled }`; `node.submit(name)`
  awaits `onRename` before ending the edit (`tree-api.ts:328-334`), so the
  async IPC rename is safe and a failed rename re-renders the old name.
  `node.reset()` ends the edit without a commit. One edit at a time: a second
  `edit()` while one is pending resolves the first as cancelled (the create
  flow's deferred timer racing a context-menu Rename trashed placeholders
  mid-edit — guarded in `startEditing`, T079).
- **Version coupling**: with the `COLLAPSE` action gone, lazy-loading depends
  on `onToggle` firing for *internal* opens (`scrollTo`/`openParents`). A
  future arborist release firing `onToggle` only for user toggles would render
  keyboard-opened folders empty. Pin `react-arborist@3.16.0` exactly (T086)
  and treat organize.spec.ts as the upgrade regression net.

## R19. Windows junctions and path containment (Phase 6, PR #9 review)

**Question**: Are the containment and no-follow guarantees actually enforced
on the platform the app runs on?

**Evidence (empirical, win32)**:

- `fs.symlinkSync(target, link, 'junction')` works without developer mode or
  admin (file symlinks require them and throw `EPERM`). readdir `Dirent`s for
  junctions report `isSymbolicLink() === true`, `isDirectory() === false` —
  so `readDir` hides them and `describeEntry` never recurses into them; the
  no-follow property holds structurally on Windows too. The old tests
  "skipped" on win32 with a comment that claimed otherwise — corrected to
  junction-based tests (T080).
- **Containment hole found by the new tests**: `resolveWithinRoot`'s ancestor
  walk re-joined `path.relative(ancestor, resolved)` onto the ancestor's real
  path; for a target under a junction, `..` folded back into a *lexical* path
  that passed containment while the OS write resolved **through** the junction
  to the outside target. A nonexistent-file path through a junction
  (`escape/new.md`) was therefore writable outside the workspace. Fixed by
  rejecting the first existing ancestor whose real path leaves the workspace
  (T079). Existing-file paths were already caught (realpath resolves the
  junction, `..` survives).

## R20. Editor chrome: TopBar (Phase 6)

**Decision**: Crepe's `[CrepeFeature.TopBar]: true` with
`[CrepeFeature.Toolbar]: false` and `[CrepeFeature.BlockEdit]: false`; the
default stylesheet (`@milkdown/crepe/theme/classic.css` + `common/style.css`)
is imported for it (main.tsx).

**Rationale**: FR-011/FR-012 need persistent access to headings and formatting
commands; the floating selection toolbar and per-line "+" handle are
transient, mouse-oriented, and visually noisy. TopBar keeps one
semantics-bearing element in the editor chrome. Recorded in spec.md
Clarifications 2026-08-02 (was previously only in tasks.md).

## R21. Watch suppression and `describeEntry` performance (Phase 6, PR #9 review)

**Status**: R8's "belt and braces" mtime/size comparison was never
implemented; only the suppression set + 2 s timeout shipped. The PR #9 review
(perf M2) noted the fixed window leaks self-mutations as external changes on
slow disks and floods the renderer after large moves. **Fix**: the window is
now sliding — each suppressed event refreshes its timestamp (T079) — so the
correctness gap is closed without the mtime comparison. A per-parent-dir
coalescing pass in main is deferred (T081).

**`describeEntry`** originally performed a synchronous, unbounded, recursive
`readdirSync` on the main thread (plan.md measured ~8 s for a 7,000-file
folder), re-run on every delete attempt. The confirmation needs only
`isEmpty` and `hasHiddenFiles`: the scan now early-exits at the first
non-markdown file, and an unreadable subfolder is reported as non-empty
(conservative warning) instead of silently understating the delete (T079).

## Version matrix

| Package | Version | Role |
|---------|---------|------|
| electron | 43.2.0 | Desktop shell |
| electron-vite | 5.0.0 | Build |
| react / react-dom | 19.2.8 | UI |
| typescript | 5.x strict | Language |
| @milkdown/crepe | 7.21.3 | Editor |
| react-arborist | 3.16.0 | Tree (peer `react >= 16.14`, React 19 compatible) |
| react-resizable-panels | 4.12.2 | Split layout (peer `^18 \|\| ^19`) |
| chokidar | 5.0.0 | File watching |
| vitest | 4.1.10 | Tests |
