# Contract: IPC Channels

**Feature**: `001-markdown-editor` | **Date**: 2026-08-01

Main↔renderer communication happens over exactly the named channels listed
below. `ipcMain.handle` for request/response; `webContents.send` for events.
Generic handlers are prohibited by Constitution Principle I.

## Request/response channels (renderer → main)

| Channel | Request | Response | Notes |
|---------|---------|----------|-------|
| `workspace:openDialog` | `void` | `Result<WorkspaceInfo \| null>` | Native folder picker. |
| `workspace:readDir` | `{ path: string }` | `Result<DirEntry[]>` | One directory level, filtered. |
| `file:openDialog` | `void` | `Result<OpenedFile \| null>` | Native file picker. |
| `file:read` | `{ path: string }` | `Result<OpenedFile>` | Validates containment; detects non-text. |
| `file:write` | `{ path: string, content: string }` | `Result<WriteReceipt>` | Atomic write. |
| `file:saveDialog` | `{ suggestedName: string, content: string }` | `Result<OpenedFile \| null>` | Native save-as. |
| `entry:create` | `{ parentPath: string, name: string, kind: EntryKind }` | `Result<DirEntry>` | New file or folder. |
| `entry:move` | `{ fromPath: string, toPath: string }` | `Result<DirEntry>` | Rename or move. |
| `entry:trash` | `{ path: string, permanent?: boolean }` | `Result<TrashReceipt>` | OS trash by default. |
| `entry:describe` | `{ path: string }` | `Result<EntryInfo>` | Delete-confirmation info: kind, emptiness, hidden files in subtree. |
| `settings:get` | `void` | `Result<Settings>` | Reads from `userData`. |
| `settings:update` | `Partial<Settings>` | `Result<Settings>` | Debounced write. |
| `quit:respond` | `{ decision: 'quit' \| 'cancel' }` | `void` | Renderer answers quit prompt. |

## Main → renderer events

| Channel | Payload | Trigger |
|---------|---------|---------|
| `workspace:changed` | `WatchEvent` | chokidar reports a change not suppressed as self-write. |
| `document:externallyChanged` | `DocumentChangeEvent` | chokidar reports the backing file changed or removed. |
| `menu:command` | `MenuCommand` | User selects a native menu item. |
| `app:quitRequested` | `void` | Before-quit fired and at least one document is dirty. |

## Self-write suppression (FR-037)

`file:write` suppresses the target path before writing. `entry:create`,
`entry:move` (both endpoints), and `entry:trash` suppress their paths too:
a mutation the user performed in the app must not be reported back to the
renderer as an external change — the renderer applies the result directly to
its own tree and document state.

## Argument validation

Every handler runs these checks in order:

1. **Shape check**: verify request is an object with expected keys and types.
   Unexpected keys are ignored.
2. **Path check**: every string value that is semantically a path goes through
   `resolveWithinRoot`. Non-string paths reject with `OUTSIDE_WORKSPACE`.
3. **Operation check**: file-only operations (`file:read`, `file:write`) refuse
   directories; directory operations (`workspace:readDir`) refuse non-directories.
4. **State check**: `NO_WORKSPACE` for operations needing a workspace when none
   is open; `NOT_FOUND` for missing targets; `CONFLICT` for existing targets.
5. **Fallback**: any unhandled exception maps to `IO` and is logged in main; it
   does **not** propagate as an unhandled promise rejection to the renderer.

## Channel naming convention

- Domain prefix: `workspace:`, `file:`, `entry:`, `settings:`, `app:`
- Colon-separated so names are self-documenting and cannot collide with
  Electron's internal channels.
- No dynamic or computed channel names. The list is closed.
