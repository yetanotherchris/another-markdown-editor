# Feature Specification: Release Distribution

**Feature Branch**: `005-release-distribution`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "This speckit spec is to make a github action which produces a binary per platform, which is installable via brew or scoop. My existing repositories have examples: https://github.com/yetanotherchris/zolam/ https://github.com/yetanotherchris/tinycity. It should use tags, e.g. v1.0.0 to trigger this, from main per the example repositories. The readme should be updated with an example installing section."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a versioned desktop release (Priority: P1)

A maintainer can create a versioned release by tagging a revision from the main
branch with a semantic version tag, producing installable release artifacts for
every supported desktop platform.

**Why this priority**: Reproducible tagged releases are the foundation for users
to obtain a trusted application version without building from source.

**Independent Test**: Tag a main-branch revision with a valid version tag in a
test repository, run the release workflow, and verify that a published release
contains correctly versioned installable artifacts for Windows, macOS, and Linux.

**Acceptance Scenarios**:

1. **Given** a revision reachable from `main` is tagged `v1.0.0`, **When** the tag
   is pushed, **Then** the release workflow starts automatically and uses `1.0.0`
   as the release version.
2. **Given** the release workflow completes successfully, **When** a user views
   the published release, **Then** it contains an installable artifact for each
   supported desktop platform.
3. **Given** a tag does not use the `vMAJOR.MINOR.PATCH` format, **When** it is
   pushed, **Then** it does not create a release.
4. **Given** a valid version tag points to a revision not reachable from `main`,
   **When** it is pushed, **Then** no release is published and the workflow
   reports why the tag was rejected.

---

### User Story 2 - Install through familiar package managers (Priority: P1)

A user can install the released application through Homebrew on supported
Unix-like desktops or Scoop on Windows, receiving the same version represented
by the release tag.

**Why this priority**: Package-manager installation is the requested primary
distribution route and makes updates and installation predictable for users.

**Independent Test**: On clean supported environments, install a tagged release
with the documented Homebrew and Scoop commands, launch the installed
application, and verify its version matches the tag.

**Acceptance Scenarios**:

1. **Given** a release tagged `v1.0.0` is published, **When** a supported macOS or
   Linux user runs the documented Homebrew installation command, **Then** the
   application version `1.0.0` is installed successfully.
2. **Given** a release tagged `v1.0.0` is published, **When** a Windows user runs
   the documented Scoop installation command, **Then** the application version
   `1.0.0` is installed successfully.
3. **Given** a package-manager installation is performed, **When** its downloaded
   artifact is verified, **Then** installation refuses an artifact whose checksum
   does not match the published release metadata.
4. **Given** a new tagged release is published, **When** users install or update
   through Homebrew or Scoop, **Then** the package definition selects that tagged
   release rather than an unversioned or development build.

---

### User Story 3 - Follow documented installation instructions (Priority: P2)

A prospective user can find concise, copyable installation examples in the
project README for supported package managers.

**Why this priority**: A release is difficult to use if people cannot discover
the correct installation command and prerequisite package source.

**Independent Test**: Starting at the README, follow the installation example in
a clean environment and verify it installs and launches the current release.

**Acceptance Scenarios**:

1. **Given** a user opens the project README, **When** they look for installation
   instructions, **Then** they find a clearly headed installation section.
2. **Given** the installation section is displayed, **When** a macOS or Linux user
   follows the Homebrew example, **Then** it includes all required package-source
   setup and installation commands.
3. **Given** the installation section is displayed, **When** a Windows user
   follows the Scoop example, **Then** it includes all required package-source
   setup and installation commands.
4. **Given** a documented command is copied exactly, **When** it is run in a clean
   supported environment, **Then** it succeeds for the current release.

---

### User Story 4 - Trust failed releases not to appear (Priority: P2)

A maintainer and users can rely on the release page and package definitions not
to advertise a version when any required platform artifact or package metadata
update failed.

**Why this priority**: A partially published desktop release strands users on a
platform and undermines confidence in the tagged version.

**Independent Test**: Force one required platform build or package-definition
update to fail in a test workflow and verify no public release or updated package
definition is published for that version.

**Acceptance Scenarios**:

1. **Given** any required platform build fails, **When** the release workflow
   finishes, **Then** it does not publish a release or update package definitions
   for that version.
2. **Given** release artifact verification fails, **When** the release workflow
   finishes, **Then** it does not publish a release or package definition
   referring to the invalid artifact.
3. **Given** all required artifacts and package definitions are ready, **When**
   the release is published, **Then** the release and both package-manager
   definitions reference the same version and verified artifacts.

---

### Edge Cases

- A release tag is created for a revision that is not reachable from `main`: it
  is rejected without publishing artifacts or changing package definitions.
- A tag is valid in shape but its version is already released: the `validate`
  job fails the run clearly, before any build, and the existing release and
  package definitions are left untouched.
- A release asset is missing, corrupted, or has a checksum mismatch: the release
  is not published and neither package manager is pointed at that asset.
- A platform-specific build fails: no partial public release is created, even if
  other platform builds succeeded.
- An installation is attempted on an unsupported architecture: the package
  manager gives an actionable unsupported-platform result rather than installing
  an incompatible artifact.
- The README installation instructions are changed independently of the package
  definitions: release validation identifies commands that no longer work before
  publication.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST provide a GitHub Actions release workflow that
  starts automatically when a tag matching `vMAJOR.MINOR.PATCH` is pushed.
- **FR-002**: The release workflow MUST publish a release only when the tagged
  revision is reachable from the `main` branch.
- **FR-003**: The release version MUST equal the numeric portion of the triggering
  tag; for example, tag `v1.0.0` produces release version `1.0.0`.
- **FR-004**: A successful release MUST contain verified, installable application
  artifacts for Windows, macOS, and Linux on the supported architectures for each
  platform.
- **FR-005**: Each published artifact MUST identify its operating system,
  architecture, and release version clearly enough for users and package managers
  to select the correct download.
- **FR-006**: The project MUST provide and update a Homebrew package definition
  that installs the matching verified release artifact on supported macOS and
  Linux environments.
- **FR-007**: The project MUST provide and update a Scoop package definition that
  installs the matching verified Windows release artifact.
- **FR-008**: Homebrew and Scoop package definitions MUST reference the exact
  release version and verified checksums of their corresponding release assets.
- **FR-009**: The release workflow MUST validate all required platform artifacts,
  checksums, and package-manager definitions before making the release public or
  updating either package definition.
- **FR-010**: If any required release build, verification, or package-definition
  update fails, the workflow MUST publish neither a partial release nor package
  definitions for that version.
- **FR-011**: The project README MUST include a clearly labeled installation
  section with complete, copyable Homebrew and Scoop examples, including any
  required package-source setup.
- **FR-012**: The documented installation examples MUST install the current
  versioned release without requiring users to build the application from source.
- **FR-013**: Release automation MUST use only credentials with the minimum
  permissions needed to publish release assets and update the project's package
  definitions.

### Key Entities

- **Release tag**: A version marker in the form `vMAJOR.MINOR.PATCH` attached to a
  revision reachable from `main`, which authorizes a release of that version.
- **Release artifact**: A verified, versioned, platform- and architecture-specific
  application package published for a release tag.
- **Package definition**: The versioned Homebrew or Scoop metadata that identifies
  the corresponding release artifact and verifies its integrity.
- **Release workflow**: The automated GitHub Actions process that validates a tag,
  builds all required artifacts, validates package definitions, and publishes a
  completed release.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid-tag release tests, pushing a `vMAJOR.MINOR.PATCH`
  tag from `main` starts one automated release and publishes verified artifacts
  for every required platform.
- **SC-002**: In 100% of invalid-tag and non-main-tag tests, no public release or
  package-definition update is created.
- **SC-003**: In 100% of clean-environment installation tests, the documented
  Homebrew and Scoop commands install and launch the release version named by the
  tag.
- **SC-004**: In 100% of published releases, every package-manager definition
  references the same version and verified checksum as its release artifact.
- **SC-005**: In 100% of injected required-build or validation failures, no
  partially published release or package-definition update is visible to users.
- **SC-006**: At least 90% of new users can find and follow the correct
  platform-specific installation example in the README within 30 seconds.

## Assumptions

- **Supported platforms**: The release scope follows the application's existing
  desktop-platform support: Windows, macOS, and Linux. Homebrew serves supported
  macOS and Linux environments; Scoop serves supported Windows environments.
- **Tag eligibility**: A tag is considered to be from `main` when its target
  revision is reachable from the current `main` branch. A tag from another branch
  is rejected even when it uses a valid version format.
- **Package source**: As in the referenced repositories, the project repository
  hosts the package definitions and the README directs users to add the required
  Homebrew tap or Scoop bucket before installation.
- **Release completeness**: All required platform artifacts and both package
  definitions are prerequisites for a public release. Manual, draft, prerelease,
  rollback, and signing/notarization workflows are out of scope unless separately
  specified.
- **Versioning**: Only stable semantic-version tags in the requested format are
  included. Pre-release tags such as `v1.0.0-beta.1` are out of scope.

## Clarifications

- **Homebrew tap is an external dependency**: the documented brew command
  `brew install yetanotherchris/tap/another-markdown-editor` resolves to the
  repository `github.com/yetanotherchris/homebrew-tap`. As of 2026-08-05 that
  repository does not exist, so FR-012 / US3 scenario 4 / SC-003 cannot pass
  until it is created and hosts a copy or forwarder of
  `Formula/another-markdown-editor.rb`. This release pipeline ships the formula
  (the source of truth) but cannot create or publish the tap; creating it is
  out-of-band and tracked in `tasks.md` (T016). Until then, the brew install
  example is the target state, not a working path; Scoop is unaffected because
  the bucket names this repo directly.
- **Actual artifact filenames**: the packaged asset names are
  `Another Markdown Editor-<version>-windows-{x64}` `.exe` / `.zip` (no
  `-setup` / `-portable` suffixes). Earlier drafts of data-model.md and
  contracts/release.md named these `-windows-x64-setup.exe` and
  `-windows-x64-portable.zip`; the implementation (electron-builder.yml,
  workflow, update scripts, tests) is the source of truth and the docs were
  corrected to match.
- **`package.json` version equals the tag version (operational rule)**: the
  build legs inject the tag version into packaging via
  `--config.extraMetadata.version`. The release job rewrites `package.json`'s
  `version` field to the tag version (`updatepackagejson.ps1`) and commits it to
  `main` alongside the Scoop and Homebrew definitions, so the committed tree
  always names the released version. A drift no longer fails the build; it is
  reconciled by the release job before the draft is published (FR-003).
  Recorded 2026-08-04 after a tag push (`v0.0.81`) failed because
  `package.json` held `0.1.0` while the tag guard required an exact match.
- **`vMAJOR.MINOR.PATCH` trigger is a glob, not a regex**: the `on.push.tags`
  filter `'v[0-9]+.[0-9]+.[0-9]+'` is a GitHub Actions glob (`.` literal, `[0-9]`
  character class, `+` one-or-more). The strict `^v[0-9]+\.[0-9]+\.[0-9]+$`
  regex is enforced inside the workflow's `validate` job (FR-001).
- **2026-08-04 — Asset names use the `ameditor` prefix**: the published
  installable asset names changed from `Another Markdown Editor-<v>-<os>-<arch>.<ext>`
  to `ameditor-<v>-<os>-<arch>.<ext>`, superseding the artifact names named
  throughout this spec (FR-005). The packaged application identity (product
  name, `.app`/`.exe` bundle names) is unchanged; only the asset file names
  changed. Recorded in `specs/009-release-binary-naming/` and enforced by
  `tests/release/release-contracts.test.ts`.
