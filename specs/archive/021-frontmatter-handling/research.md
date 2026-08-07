# Research: Frontmatter Handling

**Feature**: 021-frontmatter-handling | **Date**: 2026-08-07

Decisions are recorded R1…Rn in the order they were made. Each entry follows
Decision / Rationale / Alternatives.

## R1 — Where the split happens: a renderer pure domain module

**Decision**: A new pure module `src/renderer/domain/frontmatter.ts` exports
`splitFrontmatter(text)` and `joinFrontmatter(frontmatter, body)`. The main
process and the IPC contract are unchanged: `readFile` returns the raw bytes and
`writeFile` receives the recombined full file.

**Rationale**:
- The split/join is pure string logic with no filesystem, Electron, or React
  dependency, so it belongs in the renderer domain layer beside the existing
  `domain/dirty.ts` and is unit-testable in Vitest's jsdom environment without
  mocks.
- The constitution requires every path to be validated in main and the preload
  surface to stay a fixed list of named operations. Frontmatter is content, not
  a path or a channel, so it does not belong at the IPC boundary.
- Keeping main byte-transparent means atomic writes and the raw-bytes policy are
  untouched; the IPC contract types (`OpenedFile.content`, `writeFile(content)`)
  do not change.

**Alternatives considered**:
- Split in the main process and return `frontmatter` + `body` as separate
  fields on `OpenedFile`. Rejected: it changes the IPC contract shape, moves
  presentation-free string logic into main where it is harder to unit test, and
  couples the file channel to a markdown-format concern.
- Do the split inside `CrepeHost`/`EditorPanel` only. Rejected: the document
  state (and therefore dirty/save logic) would not know the frontmatter, so
  `getContentToSave` could not recombine it.

## R2 — Byte partition invariant: `frontmatter + body === original`

**Decision**: `splitFrontmatter` is a byte partition. Given the raw text, it
finds the opening `---` on line 1 and the first later line that is exactly
`---`; `frontmatter` is the bytes from 0 to the end of the closing delimiter
line, and `body` is everything after. `joinFrontmatter(frontmatter, body)`
is plain concatenation. Therefore `joinFrontmatter(...splitFrontmatter(t)) === t`
for every input `t`.

**Rationale**: The no-edit round trip must be byte-identical (FR-008, SC-002,
SC-003). A partition guarantees this by construction — the recombined bytes
cannot differ from the source bytes because the split did not transform, copy,
or reorder anything.

**Edge cases covered by the partition rule**:
- File starts with `---` but has no closing `---` → no frontmatter detected;
  the whole file is body (spec edge case). Deliberate: the opening delimiter
  alone is not enough to claim a frontmatter block.
- Closing `---` is the last line with no trailing newline → frontmatter includes
  it; body is `''`.
- CRLF files → delimiter lines are detected with an optional trailing `\r`;
  the bytes themselves are never rewritten, so `\r\n` survives verbatim in the
  frontmatter and body.
- A `---` line inside the body after the frontmatter (e.g. a thematic break)
  is NOT treated as another delimiter — only the FIRST closing line counts
  (FR-009), and once split, later `---` lines are body bytes.
- A line like `--- title` or ` ---` (leading space) is not a delimiter; only an
  exact `---` line (optionally `\r`-terminated) counts. This matches the spec
  assumption "the `---` delimiter must be on its own line".

## R3 — Where frontmatter is (re-)extracted

**Decision**: The split runs at every boundary where the document's full text
enters or leaves the store:
- `openFile` (OPEN_EXISTING) — raw file bytes → frontmatter + body.
- `UPDATE_CONTENT` while in source view — the textarea holds the full file, so
  every keystroke re-splits and re-stores both parts (this implements FR-007's
  "re-extract on switch" continuously, and is the only path through which
  frontmatter can change).
- `REFRESH_FROM_SOURCE` (source → formatted remount) — the full recombined text
  is re-split so both a body edit and a frontmatter edit survive the remount.
- `SAVE_SUCCESS` — the written full text is re-split so the store reflects the
  disk bytes.
- `RELOAD` — re-read disk bytes → frontmatter + body.

Formatted-view `UPDATE_CONTENT` NEVER splits: the editor serialization is
body-only and the frontmatter field is left untouched, so a pasted `---` block
in the visual editor stays body content (spec edge case) and the stored
frontmatter is never clobbered by editor output.

**Rationale**: Keeping the split at every full-text boundary and nowhere else is
the minimal consistent set. The frontmatter field is therefore always in sync
with the body whenever the document changes, and no separate "stash frontmatter
on view switch" code path is needed.

## R4 — Dirty check semantics with frontmatter

**Decision**:
- Source view dirty = `joinFrontmatter(frontmatter, content) !== baseline`
  (baseline holds the full on-disk bytes). The textarea value is the full file,
  so the byte comparison is against the same full text.
- Formatted dirty stays `!markdownSame(content, editorBaseline)` — both are
  body, frontmatter is not involved.
- `editorMatchesContent` (no-edit round trip) compares editor serialization to
  `content` (body). If only the frontmatter changed in source, the body is
  unchanged, so no remount happens and the already-stored frontmatter is
  current; if the body changed, the remount path re-splits the full text.

**Rationale**: The dirty flag must reflect "does the on-disk file differ from
what the user has now" — with frontmatter stored separately, that is a
full-text comparison in source view and an editor-normalized body comparison in
formatted view. The existing `baseline` field already holds the full-file raw
bytes, so no new field is required for the source-view check.

## R5 — Save recombination in `getContentToSave`

**Decision**: `getContentToSave` returns:
- source view: `joinFrontmatter(frontmatter, content)`;
- formatted, clean (not dirty-live): `joinFrontmatter(frontmatter, content)` —
  the raw body bytes, so a no-edit save writes the exact original bytes;
- formatted, dirty: prefer the raw stored body when the live serialization
  matches it modulo the tolerated trailing newline (`markdownSame(live, content)`)
  — a document made dirty by a FRONTMATTER-ONLY source edit has an untouched
  body and must not have its bytes rewritten by the editor's normalisation
  (2026-08-07 review). Only a body Crepe cannot represent verbatim (real drift)
  takes the serialization path (FR-12 in spec 002).

With no frontmatter, `joinFrontmatter('', body)` is just `body`, so files
without frontmatter never gain an empty block (FR-010).

**Rationale**: Recombination is a pure string concatenation of the two stored
parts. The clean path reuses the raw body bytes rather than the editor
serialization, preserving the byte-identical round trip that the raw-bytes
policy (spec 002) established for normal files. The dirty-path refinement
extends the same principle to frontmatter-only edits.

## R6 — SAVE_SUCCESS keeps the store partition (2026-08-07 review)

**Decision**: `SAVE_SUCCESS` does NOT re-split the written text into frontmatter
and body. The written text was built by `joinFrontmatter` from the stored parts,
so the store's partition is already correct and must not be re-derived from the
written bytes. Re-splitting would wrongly PROMOTE a `---` block that the user
pasted into the VISUAL editor (a body start) into the `frontmatter` field,
contradicting the spec edge case that pasted `---` content is body. The reducer
derives the written body as the written text with the stored frontmatter prefix
removed, sets `baseline` to the full written bytes, and computes `dirty` by
comparing the pre-update recombined text against the written text (the
level-corrected form of the original `d.content !== content` mid-write guard).

**Rationale**: The store's frontmatter/content partition is authoritative once
the file is open; only the load, source-edit, and reload boundaries re-derive it
(R3). Re-deriving it at save time introduces a second, conflicting source of
truth and breaks the "pasted `---` stays body" rule.

## R-Process — no process/isolation change

**Decision**: The feature is renderer-only. No new IPC channel, no preload
method, no `contextBridge` change. The renderer continues to receive and send
raw markdown bytes through the existing fixed `readFile`/`writeFile` surface.

**Rationale**: Principle I is preserved by construction — nothing new crosses
the process boundary, so there is no new attack surface to review. This is the
same process-model decision spec 002 (view-source) recorded.

**Alternatives considered**: none — moving content splitting into main was
rejected in R1.
