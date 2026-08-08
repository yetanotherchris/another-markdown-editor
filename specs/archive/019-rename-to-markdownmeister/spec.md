# Feature Specification: Rename Application to MarkdownMeister

**Feature Branch**: `019-rename-to-markdownmeister`

**Created**: 2026-08-06

**Status**: Archived

**Input**: User description: "The application name should be renamed to 'markdownmeister'. This includes the binary name ('markdownmeister.exe' etc.), the title of the window, and namespaces for types and folders. All references to 'ameditor' and 'another markdown editor', and 'another-markdown-editor' should be renamed to 'markdownmeister'. The title of the application will be Pascal case: MarkdownMeister, binaries lowercase and typescript/css/react should follow the convention of the language (pascal case, snake-case, kebab-case, camelCase etc.)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Application displays the new name (Priority: P1)

A user launches the application and sees "MarkdownMeister" in the window title bar, the taskbar/dock label, the About dialog, and any OS-level application metadata (e.g., Add/Remove Programs on Windows, application menu on macOS). The user recognises the product by its new name immediately.

**Why this priority**: The visible name is the most user-facing aspect of the rename. If the window title or taskbar label still shows the old name, the rename appears incomplete.

**Independent Test**: Launch the built application on each platform and visually confirm that every user-visible surface shows "MarkdownMeister" with correct PascalCase capitalisation.

**Acceptance Scenarios**:

1. **Given** the application is launched on Windows, **When** the main window appears, **Then** the title bar reads "MarkdownMeister" and the taskbar tooltip shows "MarkdownMeister".
2. **Given** the application is launched on macOS, **When** the main window appears, **Then** the window title reads "MarkdownMeister" and the application menu shows "MarkdownMeister".
3. **Given** the application is launched on Linux, **When** the main window appears, **Then** the window title reads "MarkdownMeister" and the desktop entry label shows "MarkdownMeister".
4. **Given** the user opens the About dialog, **When** the dialog is displayed, **Then** the product name shown is "MarkdownMeister".

---

### User Story 2 - Installed binary uses the new name (Priority: P1)

A user installs the application via the platform package manager (Scoop on Windows, Homebrew on macOS, AppImage on Linux) and the installed executable is named `markdownmeister` (`markdownmeister.exe` on Windows). Launching the application from the command line uses the new binary name.

**Why this priority**: The binary name is the primary CLI interface and must match the new brand. Users following documentation or tutorials need the correct command name.

**Independent Test**: Install the application from a release build on each platform and verify the executable name and CLI launch command.

**Acceptance Scenarios**:

1. **Given** the Windows installer has completed, **When** the user inspects the install directory, **Then** the executable is named `markdownmeister.exe` and no `ameditor.exe` exists.
2. **Given** the macOS package is installed, **When** the user inspects the application bundle, **Then** the executable inside the bundle is named `markdownmeister`.
3. **Given** the Linux AppImage is downloaded, **When** the user inspects the file, **Then** the filename follows the pattern `markdownmeister-<version>-linux-x64.AppImage`.
4. **Given** the application is installed, **When** the user runs `markdownmeister` from a terminal, **Then** the application launches successfully.

---

### User Story 3 - Package manager metadata reflects the new name (Priority: P2)

A user browsing the Scoop bucket or Homebrew tap sees the application listed as `markdownmeister`. The package metadata (homepage, description, download URLs) references the new name and new asset filenames consistently.

**Why this priority**: Package manager metadata must be self-consistent so that installs succeed and users can find the application. Broken URLs or stale names cause install failures.

**Independent Test**: Run the Scoop and Homebrew install flows against the updated manifests and formulas and confirm they download and install successfully.

**Acceptance Scenarios**:

1. **Given** the Scoop manifest file exists, **When** a user runs `scoop install markdownmeister`, **Then** the manifest downloads the correct `markdownmeister-<version>-windows-x64.zip` asset and installs it.
2. **Given** the Homebrew formula file exists, **When** a user runs `brew install markdownmeister`, **Then** the formula downloads the correct macOS and Linux assets and installs them.
3. **Given** the Scoop manifest, **When** inspected, **Then** the `homepage` URL and `bin` aliases reference `markdownmeister`, not `ameditor`.

---

### User Story 4 - Source code identifiers follow the new name (Priority: P2)

A developer working in the codebase sees consistent naming: TypeScript types and React components use PascalCase `MarkdownMeister` where appropriate, CSS class names use kebab-case `markdownmeister`, package identifiers use lowercase `markdownmeister`, and folder/file names follow the new convention. No references to `ameditor` or `another-markdown-editor` remain in source code.

**Why this priority**: Internal consistency prevents confusion and ensures the rename is complete. Stale identifiers in code are a maintenance burden.

**Independent Test**: Search the entire source tree (excluding `node_modules`, build output, and archived specs) for any remaining references to `ameditor`, `another markdown editor`, or `another-markdown-editor`.

**Acceptance Scenarios**:

1. **Given** the source tree, **When** searched for the string `ameditor` (case-insensitive), **Then** zero matches are found outside of archived spec files and git history.
2. **Given** the source tree, **When** searched for the string `another markdown editor` (case-insensitive), **Then** zero matches are found outside of archived spec files and git history.
3. **Given** the source tree, **When** searched for the string `another-markdown-editor` (case-insensitive), **Then** zero matches are found outside of archived spec files and git history.
4. **Given** the `package.json`, **When** inspected, **Then** the `name` field is `markdownmeister` and the `productName` field is `MarkdownMeister`.

---

### User Story 5 - Release artifacts use the new name (Priority: P2)

A release is built and the generated artifacts (installers, archives, update manifests) all use `markdownmeister` as the filename prefix. The update scripts (`updatescoop.ps1`, `updatebrew.ps1`) generate correct asset names and URLs pointing to the new filenames.

**Why this priority**: Release artifacts must be consistently named for distribution to work. Mismatched names break auto-update and manual downloads.

**Independent Test**: Run the build pipeline and inspect the output artifact filenames and the generated Scoop/Homebrew manifests.

**Acceptance Scenarios**:

1. **Given** a release build is triggered, **When** artifacts are produced, **Then** the Windows archive is named `markdownmeister-<version>-windows-x64.zip`, the macOS archives are `markdownmeister-<version>-macos-{arm64,x64}.zip`, and the Linux archive is `markdownmeister-<version>-linux-x64.AppImage`.
2. **Given** the `updatescoop.ps1` script is run with a version argument, **When** the manifest is generated, **Then** all asset URLs and filenames reference `markdownmeister`.
3. **Given** the `updatebrew.ps1` script is run with a version argument, **When** the formula is generated, **Then** all asset URLs and filenames reference `markdownmeister`.

---

### Edge Cases

- What happens to existing users who have the old `ameditor` binary installed? The rename does not need to migrate existing installations; a fresh install of the new version is expected. The old binary is simply replaced.
- What happens to the GitHub repository URL? The repository URL is not renamed as part of this feature. Download URLs in package manifests are updated to point to release assets with the new filenames, but the GitHub repository path remains unchanged unless the repository itself is renamed separately.
- What happens to the application ID (`com.yetanotherchris.another-markdown-editor`)? The application ID is updated to `com.yetanotherchris.markdownmeister`. This is a new application identity from the OS's perspective; existing window state persistence files keyed on the old ID will not carry over automatically.
- What happens to archived specs that reference the old name? Archived specs are historical documents and are not modified. They retain their original references.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The window title displayed in the main application window MUST be "MarkdownMeister" (PascalCase).
- **FR-002**: The packaged executable MUST be named `markdownmeister` on all platforms (`markdownmeister.exe` on Windows).
- **FR-003**: The `productName` in the build configuration MUST be "MarkdownMeister".
- **FR-004**: The `name` field in `package.json` MUST be `markdownmeister`.
- **FR-005**: The application identifier (appId) MUST be `com.yetanotherchris.markdownmeister`.
- **FR-006**: All release artifact filenames MUST use the prefix `markdownmeister` (lowercase) instead of `ameditor`.
- **FR-007**: The Scoop manifest file MUST be renamed to `markdownmeister.json` and all internal references updated to `markdownmeister`.
- **FR-008**: The Homebrew formula file MUST be renamed to `Formula/markdownmeister.rb` and all internal references updated to `markdownmeister`.
- **FR-009**: The update scripts (`updatescoop.ps1`, `updatebrew.ps1`) MUST generate asset names and URLs using the `markdownmeister` prefix.
- **FR-010**: The HTML `<title>` element in the renderer MUST be "MarkdownMeister".
- **FR-011**: Naming conventions MUST follow language standards: PascalCase for TypeScript types/components (`MarkdownMeister`), lowercase for binaries and package names (`markdownmeister`), kebab-case for CSS (`markdownmeister`), camelCase for variables/functions (`markdownMeister`).
- **FR-012**: All comments and documentation in source files MUST reference the new name. References in archived specs (`specs/archive/`) are exempt.
- **FR-013**: The `README.md` MUST be updated to reference `markdownmeister` for package names, install commands, and CLI launch instructions.
- **FR-014**: The `docs/DESIGN_DECISIONS.md` MUST be updated to reference the new application name.
- **FR-015**: Active (non-archived) spec files that reference the old name MUST be updated to reference the new name.

### Key Entities

- **Application Identity**: The combination of product name, binary name, application ID, and package name that uniquely identifies the application to users, the operating system, and package managers.
- **Release Asset**: A build output file (archive, installer, or AppImage) whose filename encodes the application name, version, platform, and architecture.
- **Package Manifest**: A metadata file (Scoop JSON, Homebrew Ruby formula) that describes how to download and install the application, including asset URLs and binary names.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of user-visible surfaces (window title, taskbar label, About dialog, OS application metadata) display "MarkdownMeister" with correct PascalCase capitalisation after the rename.
- **SC-002**: Zero occurrences of `ameditor`, `another markdown editor`, or `another-markdown-editor` remain in source files outside of `specs/archive/`, `node_modules/`, and build output directories.
- **SC-003**: The application installs successfully via Scoop and Homebrew using the new package name `markdownmeister`.
- **SC-004**: All release artifacts for a build use the `markdownmeister` prefix in their filenames, with no `ameditor`-prefixed files produced.
- **SC-005**: The application launches successfully from the command line using the `markdownmeister` command on all three platforms.
- **SC-006**: The existing test suite (unit tests and e2e tests) passes with no regressions after the rename.

## Assumptions

- The GitHub repository URL (`yetanotherchris/another-markdown-editor`) is not renamed as part of this feature. Only the application name, binary name, and release artifact names change. The repository rename, if desired, is a separate concern.
- Existing user installations are not migrated. Users uninstall the old version and install the new one, or the new installer overwrites the old binary in place.
- Window state persistence files keyed on the old application ID will not carry over. This is acceptable; the user may need to re-adjust window position/size once.
- The `yetanotherchris` GitHub username and Homebrew tap name (`yetanotherchris/tap`) remain unchanged.
- Archived specs in `specs/archive/` are historical records and are not modified.
- The `package-lock.json` is regenerated automatically when `package.json` is updated; it does not need manual editing beyond running the package manager.
