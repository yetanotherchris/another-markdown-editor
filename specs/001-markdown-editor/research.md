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

**Caveat to verify during implementation**: Crepe may normalise markdown on
load, so the string it emits immediately after construction can differ from the
bytes on disk even with no user edit. The baseline is therefore captured from
Crepe's *first* `markdownUpdated` emission, not from the file bytes, otherwise
every opened file would appear dirty at once. The file bytes are retained
separately for the round-trip guarantee in R5.

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

## R15. Deferred

| Item | Status |
|------|--------|
| App id, product name, `.md` file association | Deferred — packaging, out of scope per spec Assumptions |
| Auto-update from GitHub Releases | Deferred — needs code-signing decision first; `electron-updater` is painful unsigned on Windows and macOS |
| electron-builder / GitHub Actions | Deferred to a later feature per the agreed phase scope |

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
