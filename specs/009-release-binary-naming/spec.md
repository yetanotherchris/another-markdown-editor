# Feature Specification: Release Binary Naming

**Feature Branch**: `009-release-binary-naming`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Change the release binary names to 'ameditor', they
currently something like 'Another Markdown Editor-0.0.83-linux-x64.AppImage'."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identify releases by a short, stable prefix (Priority: P1)

A maintainer and a user can recognise every published installable by the same
short, typable prefix `ameditor`, instead of the long multi-word product name.

**Why this priority**: Download URLs, Homebrew/Scoop definitions, and shell
globs all carry the asset name; a short stable prefix is easier to read, type,
and script against, and matches the short package name already used by the
manifests (`another-markdown-editor`).

**Independent Test**: Run `electron-builder` for each target and assert that
every produced asset name begins with `ameditor-` while still embedding
version, os, and arch.

**Acceptance Scenarios**:

1. **Given** a release is built for any supported platform, **When** the build
   finishes, **Then** every installable asset name is `ameditor-<version>-<os>-<arch>.<ext>`.
2. **Given** an asset has a space-free short prefix, **When** its download URL is
   constructed, **Then** no URL encoding is needed for the product-name portion.
3. **Given** the release workflow uploads assets, **When** it curates or verifies
   them, **Then** it selects and requires the `ameditor-*` names.

---

### User Story 2 - Keep package-manager installs working (Priority: P1)

A Homebrew or Scoop install of a released version keeps working after the asset
rename.

**Why this priority**: The manifests embed the exact asset file name; a rename
must be mirrored there or installs break (FR-005/006/007/008 of spec 005 still
hold).

**Independent Test**: Update both manifests, then download the referenced asset
and verify the version and checksum match.

**Acceptance Scenarios**:

1. **Given** a published release, **When** a user installs via Scoop, **Then** the
   portable zip `ameditor-<version>-windows-x64.zip` is fetched and the app is
   mapped to the `ameditor` command name.
2. **Given** a published release, **When** a user installs via Homebrew, **Then**
   the referenced `ameditor-<version>-macos-*.zip` / `-linux-x64.AppImage` assets
   are fetched and installed.
3. **Given** either manifest update script runs against a renamed asset set,
   **When** it locates the expected file, **Then** it rewrites the definition with
   the correct `ameditor-*` file name and SHA-256.

---

### User Story 3 - Keep the contract tests green (Priority: P2)

The release-contract test suite keeps passing after the rename.

**Why this priority**: The contract tests pin the asset-name globs, the required
set, and the manifest file names; the rename must update them in the same change.

**Independent Test**: `npm run test` passes, including
`tests/release/release-contracts.test.ts`.

**Acceptance Scenarios**:

1. **Given** the rename is implemented, **When** `npm run test` runs, **Then** the
   release-contract tests pass against the updated workflow, manifests, and
   formula.
2. **Given** a future maintainer reads the spec, **When** they look up the asset
   naming rule, **Then** it is stated once, unambiguously, in this spec and its
   contract.

---

### Edge Cases

- An asset glob is broad enough to match non-installer staging output: the
  workflow still curates uploads to the `ameditor-*.{exe,zip,dmg,AppImage}`
  installers only.
- The product name (`Another Markdown Editor`) still appears in-app and in the
  macOS `.app` bundle name: the rename affects the published **asset file names**
  and the packaged **launcher binary** (named `ameditor` / `ameditor.exe`), while
  the in-app product identity is unchanged.
- Version/os/arch embedding (FR-005 of spec 005) is preserved: the rename
  changes the prefix, not the required `-<version>-<os>-<arch>` suffix.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The published installable asset names MUST use the prefix
  `ameditor` in place of the product name, producing
  `ameditor-<version>-<os>-<arch>.<ext>` for every supported platform target.
- **FR-002**: Each asset name MUST still embed version, os, and arch exactly as
  before the rename (spec 005 FR-005 continues to hold).
- **FR-003**: The release workflow's curated upload globs and its required
  artifact set MUST reference the `ameditor-*` names.
- **FR-004**: The Scoop manifest MUST reference the renamed windows portable zip
  and map the packaged `.exe` to the command name `ameditor`.
- **FR-005**: The Homebrew formula MUST reference the renamed macOS zip and Linux
  AppImage assets.
- **FR-006**: The PowerShell manifest-update scripts MUST locate and write the
  renamed asset file names.
- **FR-007**: The release-contract test suite MUST be updated to assert the
  renamed asset names, and MUST pass.
- **FR-008**: The packaged launcher binary (the executable users run) MUST be
  named `ameditor` (`ameditor.exe` on Windows) on every platform. The in-app
  product name and the macOS `.app` bundle name remain `Another Markdown Editor`.

### Key Entities

- **Asset name**: the published, downloadable file name of an installable,
  previously `Another Markdown Editor-<version>-<os>-<arch>.<ext>`, now
  `ameditor-<version>-<os>-<arch>.<ext>`.
- **Command name**: the shell command a package-manager install exposes
  (`ameditor`), distinct from the asset file name.
- **Executable name**: the packaged launcher binary inside an install
  (`ameditor` / `ameditor.exe`), distinct from the asset file name and the
  product name.
- **Packaged application identity**: the product name and `.app` bundle name
  users see when the app is installed and launched, which does not change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of packaging runs, every produced asset name matches
  `ameditor-<version>-<os>-<arch>.<ext>`.
- **SC-002**: In 100% of release-contract test runs, the suite passes with the
  renamed names asserted.
- **SC-003**: In 100% of manifest-update script runs against a renamed asset set,
  the definition is rewritten with the correct `ameditor-*` file name and hash.

## Assumptions

- **Scope of rename**: The published asset file names AND the packaged launcher
  binary change to `ameditor` (`ameditor.exe` on Windows). The product name
  `Another Markdown Editor`, the in-app name, the macOS `.app` bundle name, and
  the package/repo names (`another-markdown-editor`) are unchanged.
- **Naming pattern**: The rename substitutes the prefix only; the
  `-<version>-<os>-<arch>.<ext>` suffix established in spec 005 is preserved.
- **No re-release**: The change applies to future releases; existing published
  releases keep their historical asset names.

## Clarifications

- **2026-08-04**: `ameditor` is the name of the packaged binary (the executable
  users launch), not just the published asset file names. FR-008 amended
  accordingly: the launcher binary is `ameditor` / `ameditor.exe` on every
  platform, while the in-app product name and the macOS `.app` bundle name stay
  `Another Markdown Editor`.
