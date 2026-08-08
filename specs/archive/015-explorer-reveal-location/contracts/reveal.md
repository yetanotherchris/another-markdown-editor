# Contract: Reveal Location (`entry:reveal`)

The IPC + UI contract for spec 015. One fixed named operation (Principle I).

## IPC

| Field | Request | Response |
|-------|---------|----------|
| Channel | `entry:reveal` | — |
| Request | `{ path: string, kind: EntryKind }` | `Result<null>` |
| Preload | `revealEntry(path: string, kind: EntryKind): Promise<Result<null>>` | — |

### Validation (all in main, before any OS call)

1. Runs under `withWorkspace` — `NO_WORKSPACE` when none is open.
2. `validateShape({path, kind})`, `ensureString(path)`, `validateKind(kind)`.
3. `path` is resolved with `resolveFile` (kind `file`) or `resolveDirectory`
   (kind `directory`), which realpath-resolve and assert containment against the
   workspace root (FR-005/008).

### OS call (after validation)

| Kind | Call | Success | Failure |
|------|------|---------|---------|
| `file` | `shell.showItemInFolder(resolved)` | `ok(null)` | — (existence already proven by `resolveFile`) |
| `directory` | `await shell.openPath(resolved)` | `ok(null)` when the result string is empty | `err('IO', message)` when non-empty |

### Error mapping

| Condition | Code |
|-----------|------|
| No workspace open | `NO_WORKSPACE` |
| Target missing | `NOT_FOUND` |
| Kind/type mismatch (file kind on a directory, etc.) | `IO` |
| Path escapes the workspace | `OUTSIDE_WORKSPACE` |
| `openPath` failure | `IO` |

All error messages pass through `sanitizeError` (no absolute paths leak).

## UI

- Context menu label (FR-003, OS-adapted via `platform` from preload):
  - Windows: `Reveal in Explorer`
  - macOS: `Reveal in Finder`
  - Linux/other: `Reveal in file manager`
- Shown for every workspace file (→ reveal parent, highlight file) and folder
  (→ open folder). Not offered for the empty-background menu (no node).
- On error: `StatusFooter` note set to the sanitized message; the session and
  workspace are unchanged (FR-006).

## Verification

- e2e (`tests/e2e/reveal.spec.ts`): stub `shell.showItemInFolder`/`shell.openPath`
  in main; assert a file reveal calls `showItemInFolder` with the file's absolute
  path, a folder reveal calls `openPath` with the folder's absolute path, a
  deleted target shows the footer note and the session is unchanged, and the
  label adapts to the platform.
