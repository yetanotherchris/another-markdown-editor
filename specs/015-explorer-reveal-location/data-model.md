# Data Model: Explorer Reveal Location

## Entities

### Revealed Item (spec "Key Entities")

The workspace file or folder the user picks in the explorer context menu. No new
runtime state — it is the existing `TreeNode` (relative `path` + `kind`).

| Field | Source | Notes |
|-------|--------|-------|
| `path` | `TreeNode.id` | Workspace-relative path (validated in main) |
| `kind` | `TreeNode.kind` (`'file' | 'directory'`) | Picks the resolver + OS call |

### Workspace Root

Unchanged — `ctx.workspaceRoot`, the resolved real path of the open folder.
The containment boundary for the reveal (FR-005).

### OS File Manager

The platform default file manager. Represented by two Electron `shell` calls,
chosen by `kind`:

| Kind | Call | Result |
|------|------|--------|
| `file` | `shell.showItemInFolder(fullPath)` | Opens parent folder, highlights the file (FR-001/004) |
| `directory` | `shell.openPath(fullPath)` | Opens the folder itself (FR-002); resolves to an error string on failure |

## Validation rules

- `path` MUST be a non-empty workspace-relative string; `kind` MUST be
  `'file' | 'directory'` (validated with `ensureString` / `validateKind`).
- The resolved real path MUST lie inside the workspace root (FR-005/008) — via
  `resolveFile` / `resolveDirectory`, the same helpers as every other entry
  operation.
- A missing target → `NOT_FOUND`; a kind/type mismatch → `IO`; an escaping path
  → `OUTSIDE_WORKSPACE`. Errors are sanitized (no absolute paths leak,
  Principle II).
- The action is offered only for workspace items (the tree only renders
  workspace items, FR-007/008).

## State transitions

None — the operation is read-only; a failure leaves the session unchanged
(FR-006).
