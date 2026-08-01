<!--
SYNC IMPACT REPORT
==================
Version change: (template) → 1.0.0
Rationale: Initial ratification. First concrete constitution replacing the
unfilled Spec Kit template, so MAJOR baseline 1.0.0 applies.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Process Isolation Is Absolute
  - [PRINCIPLE_2_NAME] → II. Every Path Is Untrusted
  - [PRINCIPLE_3_NAME] → III. Never Lose The User's Words
  - [PRINCIPLE_4_NAME] → IV. Calm, Predictable Editing
  - [PRINCIPLE_5_NAME] → V. Test What Can Corrupt Or Escape

Added sections:
  - Technology Constraints (was [SECTION_2_NAME])
  - Development Workflow (was [SECTION_3_NAME])
  - Governance

Removed sections: none

Deferred TODOs: none
-->

# Another Markdown Editor Constitution

## Core Principles

### I. Process Isolation Is Absolute

The renderer process MUST NOT have direct access to Node.js, the filesystem, or
the Electron module. All disk access happens in the main process and is exposed
to the renderer only through an explicit, enumerated `contextBridge` API defined
in the preload script.

Non-negotiable settings on every `BrowserWindow`: `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`. There MUST be no `remote` module and
no `webSecurity: false`.

The preload API surface MUST be a fixed list of named operations. It MUST NOT
expose a generic escape hatch such as `invoke(channel, ...args)`, a raw `fs`
handle, or a path-to-anything reader, because such an API defeats the isolation
it appears to provide.

*Rationale*: An Electron markdown editor opens files from disk and renders
content the user did not write. A single leaked Node primitive turns a rendering
bug into arbitrary code execution on the user's machine.

### II. Every Path Is Untrusted

Once a folder is opened, it is the **root**. Every filesystem operation MUST
resolve its target and confirm the result lies inside that root before touching
disk. Validation MUST happen in the main process; renderer-side checks are
convenience only and are never trusted.

Validation MUST be based on the fully resolved real path, not on string
comparison of the requested path. Specifically it MUST defeat:

- `..` traversal, including encoded and mixed-separator forms
- absolute paths supplied where a relative path was expected
- symlinks and directory junctions pointing outside the root
- Windows drive-relative paths, UNC paths, and reserved device names
- TOCTOU races, by validating the same handle or resolved path that is used

A rejected path MUST fail closed with a typed error, MUST NOT fall back to a
"best guess" location, and MUST NOT leak absolute paths outside the root into
renderer-visible error messages.

*Rationale*: "Paths must stay under the opened folder root" is the entire
security boundary of this application. String prefix matching does not implement
it, and getting this wrong means a crafted folder can read or overwrite
arbitrary user files.

### III. Never Lose The User's Words

Unsaved work is sacred. The application MUST NOT discard user edits without an
explicit, informed confirmation.

- Closing a dirty tab, closing a window, or quitting with dirty tabs MUST prompt,
  naming the affected files.
- Writes MUST be atomic: write to a temporary file in the destination directory,
  then rename over the target. A failed or interrupted write MUST NOT leave a
  truncated or empty file where the user's document was.
- A failed save MUST leave the tab dirty and surface the failure. It MUST NOT
  silently clear the dirty flag.
- Delete and overwrite operations MUST be confirmed before execution.

*Rationale*: A text editor that loses a document has failed at its only real
job, and users judge editors far more harshly for data loss than for missing
features.

### IV. Calm, Predictable Editing

The editor MUST stay out of the writer's way.

- Typing latency MUST remain imperceptible for documents up to 10,000 lines;
  no synchronous disk or heavy parse work on the keystroke path.
- Switching tabs MUST preserve each document's undo history, cursor position,
  and scroll position.
- The UI MUST NOT reflow, steal focus, or pop dialogs while the user is typing.
- Destructive actions MUST be confirmed; non-destructive ones MUST NOT be.
- Errors MUST appear as quiet, actionable, in-context messages rather than modal
  interruptions, except where data loss is at stake.
- Layout state, such as sidebar width, MUST persist across restarts.

*Rationale*: WYSIWYG markdown editing succeeds or fails on feel. Correct
behaviour that is jarring to use will not be used.

### V. Test What Can Corrupt Or Escape

Testing effort MUST concentrate where failure is silent or dangerous, not spread
uniformly for coverage percentage.

MUST have automated tests:

- Path containment validation, including every escape vector named in
  Principle II, as explicit adversarial cases
- Atomic write and save-failure behaviour, including the interrupted-write case
- Dirty-state tracking and close/quit confirmation logic
- IPC contract shape: argument validation and typed error responses
- Markdown round-tripping, so load → edit → save does not silently mangle
  content the editor does not fully model

Path containment tests are NON-NEGOTIABLE and MUST accompany the code in the
same change. A security boundary without adversarial tests is an assumption, not
a boundary.

*Rationale*: These are the failures a user cannot see happening and cannot
recover from. Cosmetic bugs are self-reporting; corrupted files and escaped
paths are not.

## Technology Constraints

The stack is fixed by prior design decisions recorded in
`docs/DESIGN_DECISIONS.md`:

| Concern | Choice |
|---------|--------|
| Desktop shell | Electron (npm dependency, not a global install) |
| UI | React with TypeScript |
| Build | electron-vite (main, preload, renderer) |
| Split layout | `react-resizable-panels` |
| File tree | `react-arborist` (presentation only) |
| Editor | `@milkdown/crepe` |
| Disk I/O | Main process, exposed via IPC and preload `contextBridge` |
| Unit tests | Vitest |
| Packaging | electron-builder, released from GitHub Actions on tag |

Additional constraints:

- TypeScript `strict` MUST be enabled across main, preload, and renderer.
- `any` MUST NOT appear at the IPC boundary; every channel has an explicit
  request and response type shared between main and renderer.
- `react-arborist` renders the tree and MUST NOT perform filesystem work; all
  mutations route through IPC.
- Dependencies MUST be justified. Prefer the platform and existing dependencies
  over adding new ones.

## Development Workflow

- Work follows the Spec Kit flow: constitution → specify → clarify → plan →
  tasks → implement. Specification precedes implementation.
- Ambiguity MUST be resolved in the clarify step rather than guessed at during
  implementation.
- Changes MUST be reviewed against this constitution before merge, with specific
  attention to Principles I, II, and III.
- Any deviation from a principle MUST be recorded in the plan's Complexity
  Tracking section with its justification and the simpler alternative rejected.
  Undocumented deviation is a defect.
- A change that touches path handling, IPC surface, or save behaviour MUST state
  in its description how it preserves the relevant principles.

## Governance

This constitution supersedes other practices and conventions in this repository.
Where guidance conflicts, the constitution wins.

**Amendment procedure**: Amendments MUST be proposed as a change to this file,
stating the principle affected, the rationale, and the migration impact on
existing code and specs. An amendment takes effect when merged.

**Versioning policy**: This document is versioned semantically.

- MAJOR: a principle is removed or redefined in a backward-incompatible way
- MINOR: a principle or section is added, or guidance is materially expanded
- PATCH: clarification, wording, or typo fixes carrying no semantic change

**Compliance review**: Every pull request MUST verify compliance. Complexity that
violates a principle MUST be justified in writing or removed. Runtime development
guidance for agents lives in `AGENTS.md`; where it conflicts with this document,
this document governs.

**Version**: 1.0.0 | **Ratified**: 2026-08-01 | **Last Amended**: 2026-08-01
