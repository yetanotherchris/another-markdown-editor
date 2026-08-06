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

**Decision**: Trigger on `tags: ['v[0-9]+.[0-9]+.[0-9]+']` — a GitHub Actions
**glob** pattern, not a regex: `.` is a literal dot, `[0-9]` is a character
class, `+` means "one or more". `v1.2.3` matches; `v1.2`, `v1x2y3` and
`v1.0.0-beta.1` do not. The strict `^v[0-9]+\.[0-9]+\.[0-9]+$` **regex** is
additionally enforced inside the `validate` job (added after review), so the
vMAJOR.MINOR.PATCH guarantee is explicit and survives any future widening of the
trigger filter. Version = tag with the leading `v` stripped (FR-003).

**Rationale**: FR-001 requires `vMAJOR.MINOR.PATCH`; the Assumptions section
excludes pre-release tags like `v1.0.0-beta.1`. The glob in the `push` trigger
means a malformed tag never starts a release (US1 scenario 3), and the
`validate` regex makes the rejection actionable. The version is derived from
`github.ref_name` with `${VERSION#v}`.

**Alternatives considered**: Escaping the dots in the trigger
(`v[0-9]+\.[0-9]+\.[0-9]+`) — commonly recommended as "valid glob and regex",
but GitHub Actions glob semantics for `\.` are not documented and a literal
backslash match would silently disable the workflow; keeping the proven glob and
adding a real regex check in `validate` is safer (accepted). GitVersion (used by
tinycity) — adds a tool and complexity for a simple tag→version mapping
(rejected).

## R3 — Main-branch reachability gate (FR-002, US1 scenario 4)

**Decision**: In a cheap `validate` job that runs *before* the build matrix,
checkout with `fetch-depth: 0`, then run
`git merge-base --is-ancestor <ref_name> refs/remotes/origin/main` and fail with
an explicit message ("tag <tag> is not reachable from main; not creating a
release") when it returns non-zero. The `validate` job also runs the strict
semver regex and the "no existing release for this tag" check, so a bad tag
never burns a build runner.

**Rationale**: The spec defines "from main" as "target revision reachable from
the current main branch" (Assumptions). With `fetch-depth: 0` the full history
is present so `merge-base --is-ancestor` is exact. A non-reachable tag aborts
before any artifact is built or published (US1 scenario 4, FR-002). Placing the
gate in `validate` (rather than the `release` job) was a review change: the
original design only rejected non-main tags after all four build legs had run.

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
  referenced by `another-markdown-editor.json` with
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
existing suite must remain green (regression gate). The shipped release
artifacts (workflow structure, Scoop manifest JSON, Homebrew formula shape,
README install section) are verified **manually** via quickstart.md, because an
automated release-contract suite drifts stale across version bumps (the earlier
`tests/release/` Vitest suite was removed 2026-08-05 — spec 009 Assumptions).

**Rationale**: The only verifiable-in-repo artefacts are the committed workflow
and package definitions plus the README; the actual release run is verified
manually via quickstart.md (tag → release → install). A manual checklist is
robust to cosmetic edits and version drift without the maintenance cost of
pinning the exact current release in tests.

**Alternatives considered**: A Vitest "contract" suite asserting the workflow's
trigger regex, job structure, `--publish never`, `permissions`, the Scoop
manifest fields, and the README commands (the original R7) — it duplicated
manual checks and went stale every release bump (the suite failed on `main` at
v0.0.83 because it still asserted `0.1.0`), so it was removed (rejected).
Parsing the workflow with a YAML library — GitHub workflow files use the
reserved `on:` key and parsing them accurately needs a specialised YAML mode
(rejected). Attempting to run the real workflow in CI here — impossible;
releases need a real GitHub repo (out of scope; covered by quickstart.md on a
fork).

## R8 — Release ordering: draft → manifests → publish

**Decision**: The `release` job creates the GitHub Release as a **draft**
(`softprops/action-gh-release` v3, `draft: true` — the action uploads assets
before publishing and stays unpublished), then checks out `main`
(`git checkout -B main origin/main && git pull --rebase origin main`), runs both
update scripts, commits the two manifests with `git-auto-commit-action` v7
(`branch: main`), and only then publishes the draft (a second `softprops` call
with `tag_name` and `draft` omitted).

**Rationale**: This was the "draft release → commit manifests → publish"
alternative explicitly rejected in the first pass (it mirrored the reference
repos' release-first ordering). PR review found the release-first ordering was
not just a residual gap but broken in practice: on a tag push the checkout is a
detached HEAD, so `git-auto-commit-action` v5 without `branch: main` could never
push the manifest commit — every tag produced a *public* release whose Scoop and
Homebrew definitions were never updated. The draft ordering closes that window:
a public release can never exist referencing stale or missing definitions, and
FR-009's "validate before making public" holds literally (hashes are written to
the manifests while the release is still a draft). `softprops` v3 uploads assets
before publishing, so `draft: true` + later publish is a single coherent flow,
not two separate uploads. The `validate` job's "existing release" check keeps
re-runs from silently overwriting.

**Alternatives considered**: (a) Commit manifests to `main` before creating the
release — simpler, but a release-creation failure after the commit leaves `main`
pointing at a non-existent release (FR-010 risk); (b) keep release-first ordering
with the manifest commit "fixed" by `branch: main` alone — the detached-HEAD push
still fails without an explicit `git checkout -B main`; (c) `gh release edit` on
a draft after commit — softprops' `draft: true` → publish flow is fewer moving
parts (rejected).

## R9 — Credentials scope (FR-013)

**Decision**: The workflow declares a default `permissions: contents: read`;
only the `release` job overrides it with `contents: write` — the minimum needed
to (a) create a GitHub Release with assets and (b) push the package-definition
commit to `main`. The `validate` and `build` jobs keep `contents: read`. No
additional secrets. (Changed after review: the first pass granted the whole
workflow `contents: write`, which also covered the four build legs that run
`npm ci` and electron-builder and need only read.)

**Rationale**: FR-013 requires minimum credentials. Release creation and the
manifest commit both need `contents` write; the build legs need none. `GITHUB_TOKEN`
is automatically scoped to the triggering repo.

**Alternatives considered**: A dedicated PAT with narrower/org scope — unnecessary
for a single public repo; `GITHUB_TOKEN` is automatically scoped to the
triggering repo (rejected).
