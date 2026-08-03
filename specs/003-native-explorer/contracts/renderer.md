# Renderer Contract: Native Explorer

**Feature**: `003-native-explorer` | **Date**: 2026-08-03

The IPC surface and preload API are otherwise unchanged. One **additive** field
on an existing response is introduced.

## IPC surface

| Channel | Change |
|---------|--------|
| `workspace:openDialog` | response `WorkspaceInfo` gains `path: string \| null` (the realpath of the opened workspace root). No new channel, no new arguments, no new error. |

## Renderer-internal contract

All of the following operate purely on renderer state and static assets.

```text
Dependencies (bundled, offline):
  lucide-react                    # inline-SVG icon set (ISC)
  @fontsource/inter (400, 600)    # Inter woff2, imported as CSS in main.tsx

Toolbar buttons:
  New         → <Plus aria-hidden /> New          (accessible name "New")
  Open Folder → <FolderOpen aria-hidden /> Open Folder (accessible name "Open Folder")

Tree rows (explorer/Tree.tsx):
  directory → <Folder/> (closed) / <FolderOpen/> (open), aria-hidden
  file      → <FileText/>, aria-hidden
  toggle    → <ChevronRight/> (collapsed) / <ChevronDown/> (expanded),
              role="button", aria-label "Expand"/"Collapse", :focus-visible ring

StatusFooter (new, status/StatusFooter.tsx):
  props        : { activeDoc, workspaceRoot, workspaceName }
  left region  : class "document-title", text = activeDoc title + dirty marker,
                 or muted "No document open"
  right region : class "footer-workspace", title = full root, text =
                 shortenPath(root, maxChars) or muted "No folder open"

shortenPath (new, status/shortenPath.ts):
  pure fn, keeps the final folder name whole, prefixes '…' + separator when
  the path exceeds maxLength (research R4)

Header (.toolbar):
  no longer renders .document-title or .workspace-name (FR-011)
```

## Error and edge behaviour

- **No workspace open**: footer right shows the muted "No folder open"
  placeholder; never a stale path.
- **No document open / unsaved untitled doc**: footer left uses
  `activeDoc.title` (e.g. `Untitled-1`) or the muted "No document open" when
  there is no active document.
- **Workspace path too long**: `shortenPath` keeps the final folder whole with
  a `…` prefix; the full path remains in the `title` tooltip; the span has
  `overflow: hidden` + `text-overflow: ellipsis` as a hard cap so nothing
  overlaps the left region.
- **Non-Latin / long names**: lucide icons are resolution-independent inline
  SVGs; Inter covers Latin + Latin-ext, falling back to system fonts for other
  scripts (the tree text is unchanged and remains readable).
- **Keyboard / screen reader**: icon buttons keep visible text labels; the
  toggle keeps its role/aria-label/focus ring (FR-013).

## Tests that must exist

- `tests/renderer/shortenPath.test.ts` — full-fit, short-tail, final-folder
  survival, tiny-width floor, `\` vs `/`, no-separator input.
- `tests/main/ipc.test.ts` — WorkspaceInfo shape now includes `path`.
- `tests/e2e/native.spec.ts` — US1–US4 + edges, run with `npm run test:e2e`.
