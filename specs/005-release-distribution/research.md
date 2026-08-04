# Research: Release Distribution

**Date**: 2026-08-04 | **Feature**: [005-release-distribution](./spec.md)

Evidence gathered for the decisions in [plan.md](./plan.md). Decisions are
recorded as `Decision / Rationale / Alternatives considered`.

---

## R1 — Release workflow shape (reference repos)

**Decision**: A single `.github/workflows/build-release.yml` with (a) a
per-platform `build` matrix that produces all artifacts and uploads them as
workflow artifacts, and (b) one `release` job with `needs: build` that creates
the GitHub Release and updates the package definitions.

**Rationale**: This is exactly the structure of both referenced repositories.
`zolam/.github/workflows/build-release.yml` and
`tinycity/.github/workflows/build-release.yml` (fetched 2026-08-04) both use a
matrix build + `needs: build` release job. With `fail-fast: false` on the matrix
and no `continue-on-error` on required legs, the release job only starts when
every required platform build succeeded — this is the mechanism that satisfies
FR-009/FR-010 (no partial release, FR-004 every platform present).

**Alternatives considered**:
- Letting electron-builder `--publish always` upload per-leg as it goes — uploads
  happen per-leg before the other legs finish, which can leave partial uploads
  attached to a draft/tag and makes "all-or-nothing" hard to guarantee (rejected).
- A single non-matrix job building all three OSes — macOS-only runner cannot
  produce Windows installers (rejected; native runners per OS are required).

## R2 — Tag trigger and version derivation

**Decision**: Trigger strictly on `tags: ['v[0-9]+.[0-9]+.[0-9]+']` (the tinycity
regex; zolam's loose `v*.*.*` matches shapes like `v1.2` that the spec
excludes). Version = tag with the leading `v` stripped (FR-003).

**Rationale**: FR-001 requires `vMAJOR.MINOR.PATCH`; the Assumptions section
excludes pre-release tags like `v1.0.0-beta.1`. A strict regex in the `push`
trigger means a malformed tag never starts a release (US1 scenario 3). The
version is derived in the `release` job from `github.ref_name` with
`${VERSION#v}`.

**Alternatives considered**: GitVersion (used by tinycity) — adds a tool and
complexity for a simple tag→version mapping (rejected).

## R3 — Main-branch reachability gate (FR-002, US1 scenario 4)

**Decision**: In the `release` job, checkout with `fetch-depth: 0`, then run
`git merge-base --is-ancestor <ref_name> refs/remotes/origin/main` and fail with
an explicit message ("tag <tag> is not reachable from main; not creating a
release") when it returns non-zero.

**Rationale**: The spec defines "from main" as "target revision reachable from
the current main branch" (Assumptions). With `fetch-depth: 0` the full history
is present so `merge-base --is-ancestor` is exact. A non-reachable tag aborts
before any artifact is published (US1 scenario 4, FR-002).

**Alternatives considered**: `git merge-base --is-ancestor` against a locally
fetched `origin/main` (same thing); comparing the tag's commit to `main`'s HEAD
(rejected — reachability, not equality, is the requirement).

## R4 — Supported platforms and architectures (FR-004)

**Decision**: Build matrix = `windows-latest` (x64), `macos-15-intel` (x64),
`macos-latest` (arm64), `ubuntu-latest` (x64). Artifact naming embeds OS, arch,
and version (FR-005).

**Rationale**: tinycity ships exactly win-x64 / osx-x64 / osx-arm64 / linux-x64
for its desktop-adjacent tool. macOS needs both arches because Apple Silicon is
the current Mac; GitHub retired `macos-13` (the plain Intel image) in December
2025 and kept `macos-15-intel` for native x64 macOS builds — documented in the
zolam workflow comments (verified 2026-08-04). Linux x64 is the mainstream
desktop Linux target; linux-arm64 is deferred (see scope note).

**Alternatives considered**: Adding linux-arm64 (zolam builds it) — increases the
matrix and AppImage/upstream support is uneven for desktop Electron apps;
deferred, recorded as out of scope. A single `macos-latest` leg building both
arches — possible for Electron (no native compile), but two named legs match the
reference repos and keep x64 reproducible.

## R5 — electron-builder configuration

**Decision**: Add `electron-builder` as a devDependency and an
`electron-builder.yml` at the repo root. Build legs run
`npx electron-builder --publish never` so nothing uploads until the `release`
job gates everything. macOS sets `CSC_IDENTITY_AUTO_DISCOVERY=false` (no
signing/notarization — spec Assumptions: out of scope). No custom icon assets:
default Electron icons are used (custom branding is out of scope, not in the
spec). `dist/` output directory is already covered by `.gitignore`.

**Rationale**: The constitution's Technology Constraints fix
"electron-builder, released from GitHub Actions on tag". `--publish never`
defers all publishing to the single gated `release` job (R1). The app is already
an electron-vite project whose `out/**` is the packaged runtime; electron-builder
bundles `out/**`, `package.json`, and production `node_modules` (chokidar, which
is external in the vite config, is a runtime `dependency`).

**Alternatives considered**: A custom packaging script — electron-builder is the
constitution-fixed choice and handles NSIS/dmg/AppImage per-OS (rejected).

## R6 — Package definitions: Scoop manifest and Homebrew formula

**Decision**:
- **Windows/Scoop**: a portable `.zip` asset (electron-builder `zip` target, x64)
  referenced by `scoop/another-markdown-editor.json` with
  `architecture.64bit.url`, `architecture.64bit.hash` (SHA-256, lowercase), and
  `bin: [["Another Markdown Editor.exe", "another-markdown-editor"]]`.
- **macOS/Homebrew**: the `.zip` asset (contains the `.app`), referenced by
  `Formula/another-markdown-editor.rb` with a per-arch `on_macos do … end` block
  (arm64 and Intel) and `app.install` in `install`. A *formula* (not a cask) so
  the same definition serves Linux too (FR-006 names macOS *and* Linux).
- **Linux/Homebrew**: the `.AppImage` asset, in `on_linux do … end`, installed
  to `bin` (made executable). Homebrew-on-Linux serves this path.
- Update logic lives in two PowerShell scripts (AGENTS.md: `.ps1` on Windows,
  never `.bat`): `updatescoop.ps1` and `updatebrew.ps1`, mirroring the reference
  repos. Both `throw` when a required artifact is absent, so a missing/invalid
  asset fails the workflow before any definition is committed (FR-009/010, US4
  scenario 2).

**Rationale**: This mirrors the referenced repositories exactly — Scoop JSON at
repo root referenced by `scoop bucket add <name> <repo>`, a `Formula/*.rb`
class, and `.ps1` update scripts that compute `Get-FileHash -Algorithm SHA256`
from the downloaded artifacts and rewrite the definitions (FR-008: exact version
and verified checksum). Scoop installs from a zip via `bin`; it cannot consume an
NSIS installer, hence the portable zip. A formula (not a cask) is required to
also serve Linux per FR-006.

**Alternatives considered**:
- A cask for macOS only — casks do not run on Homebrew-on-Linux, violating
  FR-006's "macOS and Linux" (rejected).
- Scoop referencing the NSIS installer with silent `/S` args — works but is a
  heavier, machine-specific install; a portable zip + `bin` matches the reference
  repos (rejected).
- Committing update scripts in the workflow inline (heredocs) — hard to test and
  to review; the reference repos ship checked-in scripts (rejected).

## R7 — Testing strategy for a CI/release feature

**Decision**: The feature adds no renderer surface, so the Playwright e2e
requirement of AGENTS.md applies to the app's user-visible behaviour only — the
existing suite must remain green (regression gate). New coverage is a Vitest
"contract" suite in `tests/release/` that validates the *shipped artifacts*
without running GitHub Actions:
- the workflow file's trigger regex, job structure, reachability gate, matrix
  legs, `--publish never`, `fail_on_unmatched_files`, and minimal
  `permissions: contents: write` (FR-001/002/004/009/013, US1 scenarios 1/3/4),
  asserted via structural text checks (deliberately NOT a YAML parse — see
  below);
- the Scoop manifest parses as JSON and has the required `version` /
  `architecture.64bit.{url,hash,bin}` fields;
- the Homebrew formula contains the required per-OS/arch blocks and placeholder
  structure;
- the README contains the installation section and the exact documented brew /
  scoop commands (FR-011, US3 scenarios 1–3).

**Rationale**: The only verifiable-in-repo artefacts are the committed workflow
and package definitions plus the README; the actual release run is verified
manually via quickstart.md (tag → release → install). Structure-level assertions
are robust to cosmetic edits and fail loudly when a requirement (trigger, gate,
permissions, manifest fields) regresses.

**Alternatives considered**: Parsing the workflow with a YAML library — GitHub
workflow files use the reserved `on:` key and parsing them accurately needs a
specialised YAML mode; line/block structure assertions are simpler and sufficient
for a contract test (rejected). Attempting to run the real workflow in CI here —
impossible; releases need a real GitHub repo (out of scope; covered by
quickstart.md on a fork).

## R8 — Known residual gap: release-then-manifest ordering

**Decision**: The `release` job creates the GitHub Release *before* updating the
package definitions (release assets must exist for the manifests to point at
them). A failure between "release created" and "manifests committed" leaves a
release whose definitions are stale; this matches the reference repos and is
mitigated by `fail_on_unmatched_files: true` (a missing asset fails the release
creation) and idempotent update scripts (a re-run of the tag overwrites both).

**Rationale**: FR-010's "no partial public release" is enforced at the two
gates that matter most — the `needs: build` matrix gate (a failed build means no
release at all) and the artifact-completeness/checksum validation that runs
*before* `softprops/action-gh-release`. The small post-creation window matches
the reference repos' accepted behaviour and is documented rather than silently
accepted.

**Alternatives considered**: Draft release → commit manifests → publish — more
moving parts and a second `gh` round-trip; the reference repos do not do it
(rejected).

## R9 — Credentials scope (FR-013)

**Decision**: The workflow declares `permissions: contents: write` (the default
`GITHUB_TOKEN`), the minimum needed to (a) create a GitHub Release with assets
and (b) push the package-definition commit to `main`. No additional secrets.

**Rationale**: FR-013 requires minimum credentials. Release creation and the
manifest commit both need `contents` write; nothing else in the workflow touches
packages, actions, or secrets.

**Alternatives considered**: A dedicated PAT with narrower/org scope — unnecessary
for a single public repo; `GITHUB_TOKEN` is automatically scoped to the
triggering repo (rejected).
