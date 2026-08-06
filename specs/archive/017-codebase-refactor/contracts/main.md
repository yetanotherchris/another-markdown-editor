# Contracts: Codebase Refactor — main process

The handler module map, the shared context contract, and the registration
contract for the `src/main/ipc` split (FR-005). The public IPC surface and the
preload `DesktopApi` are unchanged (FR-021, SC-011).

## Shared context (`src/main/ipc/handlers/context.ts`)

A single module owning the state and helpers that every handler module needs.
No handler module re-implements these (grok suggestion 3).

```ts
// State
workspaceState: WorkspaceState | null
workspaceRoot: string | null
allowClose: boolean

// Result + error helpers
ok<T>(value: T): Result<T>
err(code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string }
sanitizeError(e: unknown, workspaceRootPath: string | null): string   // calls scrubAbsolutePaths (Principle II)
toAppError(e: unknown): { code: ErrorCode; message: string }
ensureString(val: unknown, name: string): asserts val is string
validateKind(val: unknown): asserts val is EntryKind
validateShape(obj: unknown, requiredKeys: string[]): void
withWorkspace<T>(fn: () => T): Result<T>
resolveAbsolutePath(root: string, absolutePath: string): string | null

// Spec-004 recent/fs helpers (moved from handlers.ts)
isRecentEntry(path_: string, kind: RecentKind): boolean
recordRecent(path_: string, kind: RecentKind, name: string): void
removeRecent(path_: string, kind: RecentKind): void
canonicalPath(p: string): string
openFileFromPath(filePath: string): OpenedFile
```

`getWorkspaceState()`/`getWorkspaceRoot()` (the current handlers.ts exports) move
to `context.ts` as direct state accessors; `register.ts` does not re-export them
(they are unused outside handlers.ts).

## Registration contract

Each domain module exports a single `register` function taking the window (for
`webContents.send`) and the shared context:

```ts
// files.ts
export function registerFileHandlers(window: BrowserWindow, ctx: typeof context): void
// dialogs.ts
export function registerDialogHandlers(window: BrowserWindow, ctx: typeof context): void
// workspace.ts
export function registerWorkspaceHandlers(window: BrowserWindow, ctx: typeof context): void
// settings.ts
export function registerSettingsHandlers(window: BrowserWindow, ctx: typeof context): void
// recent.ts
export function registerRecentHandlers(window: BrowserWindow, ctx: typeof context): void
// app.ts
export function registerAppHandlers(window: BrowserWindow, ctx: typeof context): void
```

`src/main/ipc/register.ts` keeps its idempotent guard and calls all six:

```ts
export function registerIpcHandlers(window: BrowserWindow): void {
  if (registered) return
  registered = true
  const ctx = context
  registerAppHandlers(window, ctx)        // must run first: owns setupWindowCloseHandler
  registerFileHandlers(window, ctx)
  registerWorkspaceHandlers(window, ctx)
  registerDialogHandlers(window, ctx)
  registerSettingsHandlers(window, ctx)
  registerRecentHandlers(window, ctx)
}
```

`handlers/app.ts` owns `setupWindowCloseHandler(window)` and `tryCloseWindow()`
(the `app:requestQuit`/`quit:respond` lifecycle and the `allowClose` flag).

## Channel invariants (unchanged)

- Every `ipcMain.handle` is registered exactly once (the existing idempotent
  guard in register.ts prevents double-registration on window recreation).
- Request validation (`validateShape`/`ensureString`/`validateKind`) stays
  server-side in the handler modules (Principle II — renderer checks are never
  trusted).
- `sanitizeError` remains the only path to a renderer-visible message and always
  runs the absolute-path scrub (Principle II, FR-015).
- `dialog:show` still routes through `validateNativeDialogRequest` then
  `showNativeConfirmation` (spec 008, `dialogs.ts`).
- The two-phase folder open stays split across `workspace:prepareFolderOpen` /
  `workspace:commitFolderOpen` / `workspace:cancelFolderOpen` with the
  single-in-flight `pendingFolderOpen` guard (FR-009/FR-010).
- `file:write` stays atomic via `writeFile`/`resolveWithinRoot`; `recent:*`
  writes stay best-effort (`recordRecent`/`removeRecent` catch and report
  quietly, FR-011).

## Test contract

- `tests/main/ipc.test.ts` (the IPC contract shape test) is unchanged — it pins
  `DesktopApi` and the shared types, which do not move (SC-011).
- New unit coverage for extracted handler-domain logic only where the extracted
  unit is electron-free; the handler modules themselves remain e2e-covered
  (they bind Electron's `ipcMain`, which unit tests do not instantiate). Per
  the claude document item 20, the split enables per-handler-group testing of
  any pure helper; the shared `context.ts` helpers are the natural unit target
  where they are not already covered (e.g. `openFileFromPath`, `canonicalPath`).
