# Research: Explorer Reveal Location

## R1 — `shell.showItemInFolder` for files, `shell.openPath` for folders

**Decision**: files reveal with `shell.showItemInFolder(fullPath)`; folders open
with `shell.openPath(fullPath)`.

**Rationale**: Electron's `shell.showItemInFolder` opens the OS file manager at
the item's PARENT with the item selected/highlighted — exactly FR-001 + FR-004
for files. `shell.openPath` opens the target itself and returns a `Promise<string>`
(empty on success, an error message otherwise), which is the right surface for
folders (FR-002: "opens that folder") and for surfacing FR-006 failures. The
workspace-root edge case ("the file manager opens at the workspace root folder")
falls out of `openPath(root)` naturally.

**Alternatives considered**: `showItemInFolder` for folders too (rejected — it
opens the folder's PARENT, which contradicts FR-002's "opens that folder");
`openPath` for files (rejected — no highlighting, so FR-004 is lost).

## R2 — Path validation reuses `resolveFile`/`resolveDirectory`

**Decision**: the handler resolves the relative path with `resolveFile(root,
relative)` for files and `resolveDirectory(root, relative)` for folders, both
wrapped in `withWorkspace`.

**Rationale**: these helpers already realpath-resolve, assert containment against
the workspace root, distinguish NOT_FOUND/IO, and are the same code every other
entry operation trusts (FR-005/008, Principle II). Reusing them avoids a new
validation path that could drift from the security boundary. The `kind` from the
renderer selects which resolver runs, so a `file` kind targeting a directory
fails with `IO` ("Expected a file, got a directory") — the resolver enforces
type consistency.

**Alternatives considered**: a bespoke reveal-only validator (rejected — 
duplication of the security boundary); trusting the renderer's relative path
without a resolve step (rejected — Principle II).

## R3 — Platform-adapted label via a preload-exposed `platform` field

**Decision**: the preload exposes `platform: process.platform` on the DesktopApi;
the renderer chooses the menu label ("Reveal in Explorer" / "Reveal in Finder" /
"Reveal in file manager").

**Rationale**: spec Assumptions require an OS-appropriate label (FR-003), and the
renderer is sandboxed with no Node, so it cannot read `process.platform` itself.
Exposing the platform string through the existing contextBridge is a fixed,
read-only value (Principle I is about capabilities, not data).

**Alternatives considered**: guessing the OS in the renderer from
`navigator.platform` (rejected — unreliable and duplicated); a single generic
label (rejected — contradicts the spec's OS-adaptation assumption).

## R4 — Quiet footer note for failures

**Decision**: the App's `onReveal` handler sets `footerNote` from the reveal
error's sanitized message.

**Rationale**: FR-006 requires a "quiet, in-context error" that does not disturb
the current document or workspace. The existing `StatusFooter` note is exactly
that surface (already used for recent-items persistence warnings); no modal or
dialog is involved. The reveal operation is read-only, so the session is
untouched by construction.

**Alternatives considered**: the native `operation-failed` dialog (rejected —
modal, not "quiet"; the footer note already exists).
