# Contract: Frontmatter Handling

**Feature**: 021-frontmatter-handling | **Date**: 2026-08-07

## Scope

This feature is renderer-only. The IPC contract in
`src/shared/ipc-contract.ts` is **unchanged**: no new channels, no changes to
`OpenedFile` or `writeFile`, no preload additions (research R1, R-Process).

## Pure domain contract — `src/renderer/domain/frontmatter.ts`

```ts
export interface FrontmatterParts {
  frontmatter: string
  body: string
}

/** Split raw file text into a frontmatter block and a body. Byte partition:
 *  frontmatter + body === text always (research R2). */
export function splitFrontmatter(text: string): FrontmatterParts

/** Concatenate stored frontmatter and body back into a full file. */
export function joinFrontmatter(frontmatter: string, body: string): string
```

### `splitFrontmatter` behaviour contract

| Input | `frontmatter` | `body` |
|-------|---------------|--------|
| `'---\ntitle: x\n---\n\n# Body'` | `'---\ntitle: x\n---\n'` | `'\n# Body'` |
| `'# No frontmatter\nbody'` | `''` | the whole text |
| `'---\nunclosed'` | `''` | the whole text |
| `'---\n---\n# Empty fm'` | `'---\n---\n'` | `'# Empty fm'` |
| `'---\ntitle: x\n---'` (no trailing newline) | `'---\ntitle: x\n---'` | `''` |
| CRLF variant | `'---\r\ntitle: x\r\n---\r\n'` | `'\r\n# Body'` |

Invariants:
- `joinFrontmatter(...splitFrontmatter(text)) === text` for every `text`.
- A delimiter is a line whose content is exactly `---` (optionally `\r`
  before the line break). Leading whitespace or trailing text on the line is
  not a delimiter.
- Only the block starting on line 1 counts; only the first closing `---` line
  closes it (FR-009).
- No YAML parsing, validation, or normalisation is performed.

### `getContentToSave` contract (extended)

`src/renderer/domain/dirty.ts`:

```ts
export function getContentToSave(doc: DocumentState, getMarkdown: MarkdownAccessor): string
```

Returns the **full file** text to write, per research R5:
- source view → `joinFrontmatter(doc.frontmatter, doc.content)`
- formatted, clean → `joinFrontmatter(doc.frontmatter, doc.content)`
- formatted, dirty → `joinFrontmatter(doc.frontmatter, getMarkdown(doc.id) ?? doc.content)`

## DocumentState contract (extended)

`src/renderer/state/documents.ts` `DocumentState` gains:

```ts
frontmatter: string  // raw block incl. delimiters, or '' when none (FR-004)
```

Reducers that (re-)split on full-text boundaries (research R3):
`OPEN_EXISTING` → `openFile`, `UPDATE_CONTENT` (source view), `SAVE_SUCCESS`,
`RELOAD`, `REFRESH_FROM_SOURCE`.

## Acceptance contract

The acceptance scenarios from `spec.md` US1–US4 are verified in
`tests/e2e/frontmatter.spec.ts` against the built app:
- visual editor shows only the body (US1),
- save recombines frontmatter + body and never adds an empty block (US2),
- source view shows/edits the full file and edits survive view switches (US3),
- a no-edit save is byte-identical (US4).
