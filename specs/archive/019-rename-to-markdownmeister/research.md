# Research: Rename Application to MarkdownMeister

Decisions and evidence for the spec 019 rename. Each decision states what was
chosen, why, and the alternatives rejected.

## R1 — The naming map is a contract, not scattered edits

**Decision**: One contract file (`contracts/rename.md`) holds the complete
old→new string mapping by file; every edit task applies it and the verification
task greps the old strings to prove completeness.

**Rationale**: A rename is a completeness problem, not a complexity problem. The
failure mode is a stray `ameditor` or `--ame-*` left in one file while the rest
is renamed. A single authoritative map turns "did we rename everything?" into a
mechanical grep against the contract.

**Alternatives considered**: ad-hoc per-file renaming (rejected — no way to audit
completeness); a scripted global search-and-replace across the repo (rejected —
the repo URL must be preserved, so a blanket replace is wrong and a word-boundary
regex would be error-prone).

## R2 — electron-builder identity sources

**Decision**: `productName` and `name` in `package.json` and
`electron-builder.yml` are the single source of truth for the OS-facing identity.
`productName: MarkdownMeister` drives the macOS `.app` bundle name
(`MarkdownMeister.app`), `app.name` (macOS application menu), and the Windows
taskbar/metadata; `executableName: markdownmeister` drives the launcher binary
(`markdownmeister.exe` on Windows); `appId: com.yetanotherchris.markdownmeister`
is the new OS application identity.

**Rationale**: electron-builder's documented fields map 1:1 onto the spec's
requirements (FR-002/003/005). Verified against the project's existing
`electron-builder.yml` (spec 009 already uses exactly these fields for the
`ameditor` binary).

**Alternatives considered**: hard-coding the name in `app.setName(...)` at
runtime (rejected — would not rename the packaged binary or OS metadata).

## R3 — Window title needs no BrowserWindow change

**Decision**: The window/taskbar title comes from the HTML `<title>` element in
`src/renderer/index.html` (→ `MarkdownMeister`); `productName` supplies OS-level
metadata. No `title:` option is added to the `BrowserWindow` constructor.

**Rationale**: The current window already derives its title from the document
title (no explicit `title` is set in `src/main/index.ts`). Changing the HTML
title alone makes the running app, the taskbar tooltip, and the macOS menu all
show "MarkdownMeister" (menu label is `app.name` ← productName, R2).

## R4 — Manifests keep the current version/hash until the next release

**Decision**: `markdownmeister.json` and `Formula/markdownmeister.rb` are renamed
and all names/URLs updated, but the `0.0.96` version and SHA256 hashes are left
as-is.

**Rationale**: The hashes refer to the last published `ameditor-0.0.96-*` assets.
A `markdownmeister-0.0.96-*` asset does not exist yet — it is produced by the
next tagged release, which runs `updatescoop.ps1`/`updatebrew.ps1` and rewrites
both version and hashes. Editing the hashes now would point the manifest at a
nonexistent file either way; the names must be right and the regeneration flow
handles the rest (spec 009/005 precedent: the update scripts were built for
exactly this).

**Alternatives considered**: keeping the old `ameditor` asset names in the
manifests (rejected — SC-004 and the acceptance scenarios require
`markdownmeister`-prefixed assets); guessing new hashes (impossible without the
files).

## R5 — Repo URL is the one documented exception to SC-002

**Decision**: `https://github.com/yetanotherchris/another-markdown-editor` (and
the bare `yetanotherchris/another-markdown-editor`) remains everywhere it names
the GitHub repository: manifest/formula `homepage`, download URLs, README install
instructions, spec 007, and `docs/DESIGN_DECISIONS.md`.

**Rationale**: Spec Assumptions explicitly exclude the repo URL from the rename;
the spec text itself uses the URL string in its own Assumptions and Edge Cases.
SC-002's "zero occurrences" must therefore be read as "zero occurrences of the
old *application* name", with the repo URL as the sole documented exception. The
rename contract (R1) records which strings are *not* renamed so a later
maintainer does not "fix" the URL and break every download link.

**Alternatives considered**: renaming the URL (rejected — the repo is not
renamed; a broken URL fails SC-003 installs).

## R6 — Full cleanup of `AME`/`ame` abbreviations (user decision)

**Decision**: The rename covers abbreviations derived from the old name:
`AME_USER_DATA_DIR` → `MM_USER_DATA_DIR`, `AME_CONFIG_DIR` → `MM_CONFIG_DIR`,
`AME_E2E_HEADED` → `MM_E2E_HEADED`, `--ame-*` → `--mm-*`, `.ame-spelling-error` →
`.mm-spelling-error`, `'ame-spellcheck'` → `'mm-spellcheck'`,
`appData/ame` → `appData/markdownmeister`, `ame-*` temp prefixes → `mm-*`.

**Rationale**: User decision (full cleanup). The CSS tokens and seams are
internal, so the churn is mechanical and zero user-visible risk; the config
folder rename changes where `config.json` lives, which the spec's Assumptions
accept (state does not carry over; spec 022 later defines its own migration).

**Alternatives considered**: literal-string-only rename (rejected by the user).

## R7 — Spec 022 required config path renamed (user decision)

**Decision**: Spec 022's required config path becomes
`~/.config/markdownmeister/config.json` (all platform variants and edge cases
rewritten), its `AME_CONFIG_DIR` seam reference becomes `MM_CONFIG_DIR`, and its
migration sources (`%APPDATA%/ame/…`, `~/Library/Application Support/ame/…`,
`~/.config/ame/…`) become the post-rename locations.

**Rationale**: User decision. Spec 019 FR-015 (update active specs) conflicted
with spec 022's original FR-001 (folder named `another-markdown-editor`). The
rename wins; spec 022's change is recorded in its `## Clarifications`.

**Alternatives considered**: keeping spec 022's `another-markdown-editor` folder
(rejected by the user — left a stale app name in an active spec).

## R8 — Environment: no new dependencies

**Decision**: No dependencies are added, changed, or removed; `package-lock.json`
is regenerated by npm after the `name` edit (spec Assumptions).

**Rationale**: The rename touches configuration and identifiers only.
