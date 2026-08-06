# Quickstart: Frontmatter Handling

**Feature**: 021-frontmatter-handling | **Date**: 2026-08-07

Runnable validation guide proving the feature works end-to-end. For the design
rationale see `research.md`; for the reducer/document-state details see
`data-model.md` and `contracts/frontmatter.md`.

## Prerequisites

- Node + npm installed.
- `npm install` run at the repo root.

## Fixture

Create a scratch folder `~/fm-check/` containing:

`~/fm-check/post.md`:

```markdown
---
title: Hello
tags:
  - one
  - two
---

# Heading

Body paragraph.
```

`~/fm-check/plain.md`:

```markdown
# Plain

No frontmatter here.
```

## Commands

### Unit tests (domain + reducer)

```sh
npx vitest run tests/renderer/frontmatter.test.ts tests/renderer/documents.frontmatter.test.ts
```

Expected: all pass. These cover the split/join byte-partition invariant and the
reducer's open/save/source-edit/reload transitions with frontmatter.

### Typecheck, lint, full unit suite

```sh
npm run typecheck
npm run lint
npm run test
```

Expected: clean. The pre-existing reducer suites must still pass unchanged —
files without frontmatter are handled identically to before (split is a no-op).

### E2E (builds, then launches Electron via Playwright)

```sh
npm run test:e2e -- frontmatter
```

Expected: the frontmatter spec passes, exercising the acceptance scenarios of
spec 021 against the real built app.

## Manual walkthrough (dev)

```sh
npm run dev
```

1. **US1 — visual editor hides frontmatter**: Open `post.md`. Only `# Heading`
   and `Body paragraph.` are visible. No horizontal rules, no bullet lists, no
   raw YAML lines. Open `plain.md` — the whole file shows normally.
2. **US2 — save recombines**: Edit the body of `post.md` (e.g. append a line),
   save (Ctrl+S / menu). Read `post.md` — the frontmatter block is intact at the
   top, followed by the edited body. Open `plain.md`, edit, save — no
   `---` block was added.
3. **US3 — source view shows/edits frontmatter**: Open `post.md`, click View
   source. The textarea begins with the frontmatter block. Change `title` to
   `Goodbye`, return to visual editing, save. The saved file has `title: Goodbye`
   and the same body.
4. **US4 — byte-identical round trip**: Make a copy of `post.md` as
   `post.orig.md`. Open `post.md`, save **without editing**, then diff:
   ```sh
   diff post.md post.orig.md
   ```
   Expected: no output (identical bytes).

## Expected outcomes

- Files with valid frontmatter open with only the body visible (SC-001).
- Saves on frontmatter files preserve the block verbatim when unedited (SC-002).
- Source view always shows the complete file (SC-003).
- Any number of view switches does not alter frontmatter or body (SC-004).
