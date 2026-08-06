# Data Model: Frontmatter Handling

**Feature**: 021-frontmatter-handling | **Date**: 2026-08-07

## Entities

### Document (spec: Key Entities)

A markdown file with an optional frontmatter block and a body.

| Field | Type | Notes |
|-------|------|-------|
| `frontmatter` | `string` | The raw text between the opening and closing `---` delimiters, **including** the delimiters. `''` when the file has no frontmatter. Never parsed or validated — an opaque string preserved verbatim. |
| `body` | `string` | Everything after the closing delimiter. This is what the visual editor receives and what the source view recombines with the frontmatter. |

Invariant: for the raw file bytes `raw`, `splitFrontmatter(raw)` produces
`(frontmatter, body)` such that `frontmatter + body === raw` (byte partition,
research R2).

### Document State (`src/renderer/state/documents.ts`)

`DocumentState` gains one field:

| Field | Type | Notes |
|-------|------|-------|
| `frontmatter` | `string` | NEW. The raw frontmatter block including `---` delimiters, or `''`. Lives with the document for the whole editing session (FR-004). |

Existing fields and their meaning **with** frontmatter:

| Field | Meaning now |
|-------|-------------|
| `content` | The **body** only. What `CrepeHost` parses (FR-003) and what source view recombines into the full file. |
| `baseline` | The raw full-file bytes on disk (as read, or last written). The reference for the source-view byte-identical dirty check. |
| `editorBaseline` | The editor's serialization of the body it last parsed. The reference for the formatted live-dirty check. |
| `diskBytes` | Unused (legacy, always `null`). Unchanged. |

### Frontmatter (spec: Key Entities)

The raw YAML text block at the start of a document, including its `---`
delimiters. Stored as an opaque string; the system does not parse or validate
the YAML (spec Assumption). Only the block at the very start of the file is
recognised; only one per file (spec Assumption).

## Derived value

The complete file text for a document at any moment is:

```text
full = joinFrontmatter(frontmatter, content)
```

Used by:
- source view display (`EditorPanel` → `SourceView` value),
- source-view dirty check (`joinFrontmatter(frontmatter, content) !== baseline`),
- `getContentToSave` recombination on save.

## State transitions

The split/join runs at these transitions (research R3):

| Transition | Action | Effect |
|-----------|--------|--------|
| Open file | `OPEN_EXISTING` → `openFile` | `splitFrontmatter(raw)` → store `frontmatter`, `content = body`, `baseline = raw`. |
| Type in source view | `UPDATE_CONTENT` (view = source) | Payload is the full textarea value; `splitFrontmatter(payload)` → update `frontmatter` + `content`; dirty = `joinFrontmatter(...) !== baseline`. |
| Type in formatted view | `UPDATE_CONTENT` (view = formatted) | Payload is the body serialization; `content = payload`; frontmatter untouched. |
| Source → formatted with body change | `REFRESH_FROM_SOURCE` | Payload is full recombined text; re-split → update `frontmatter` + `content`; bump `contentVersion`. |
| Save | `SAVE_SUCCESS` | Payload is the written full text; re-split → update `frontmatter` + `content`; `baseline = payload`. |
| Reload | `RELOAD` | Re-read bytes; re-split → update both; `baseline = raw`. |

## Dirty rules

- Source view: `joinFrontmatter(frontmatter, content) !== baseline` (full-text
  byte comparison).
- Formatted view: `!markdownSame(content, editorBaseline)` — body only, as
  before. Frontmatter cannot change from formatted view, so it never affects the
  formatted dirty flag.
- `getContentToSave`: always returns `joinFrontmatter(frontmatter, <body>)`
  where `<body>` is raw body (clean) or editor serialization (dirty).
