# Implementation Plan: Release Distribution

**Branch**: `005-release-distribution` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-release-distribution/spec.md`

## Summary

Give the desktop app a reproducible, all-or-nothing release pipeline: a GitHub
Actions workflow triggered only by `vMAJOR.MINOR.PATCH` tags whose target is
reachable from `main` builds verified installable artifacts for Windows, macOS
and Linux, publishes them as a single GitHub Release, and updates the Homebrew
formula and Scoop manifest that install that exact version. The README gains a
copyable installation section. Failure anywhere in the required chain (bad tag,
non-main tag, failed build, missing/corrupt artifact, bad checksum) publishes
nothing.

## Technical Context

**Language/Version**: TypeScript 5.8 strict (app, unchanged); YAML for the
workflow; Ruby for the Homebrew formula; PowerShell 7 for the manifest update
scripts (AGENTS.md: `.ps1` on Windows, never `.bat`).

**Primary Dependencies**: New devDependency `electron-builder` (the
constitution-fixed packaging tool, already named in `docs/DESIGN_DECISIONS.md`).
GitHub Actions steps: `actions/checkout`, `actions/setup-node`,
`actions/upload-artifact`, `actions/download-artifact`,
`softprops/action-gh-release` (v3), `stefanzweifel/git-auto-commit-action` (v7) —
all pinned to **full commit SHAs** (not mutable major-version tags; a security-review
hardening) and kept current by Dependabot (`.github/dependabot.yml`). No new runtime
dependency.

**Storage**: N/A for the app. Release state lives in GitHub (Release assets,
tag history); package definitions are committed files: `scoop/another-markdown-editor.json`
and `Formula/another-markdown-editor.rb`.

**Testing**: Vitest 4. New `tests/release/` contract suite validates the shipped
release artifacts (workflow structure, Scoop manifest JSON, Homebrew formula
shape, README install section) without running GitHub Actions. The existing
unit + Playwright e2e suites must stay green (regression gate). The actual
tag→release→install flow is verified manually per quickstart.md.

**Target Platform**: Windows x64, macOS x64 + arm64, Linux x64 (release scope
matches the app's supported desktop platforms; research R4).

**Project Type**: Desktop application (Electron) with CI/CD release automation.

**Performance Goals**: N/A (CI-only feature). No keystroke-path impact
(Principle IV).

**Constraints**: Release automation runs entirely in GitHub Actions (Principle I
is unaffected — no renderer or main-process change). `dist/` build output stays
gitignored. No signing/notarization (spec Assumptions: out of scope). Only
stable semver tags (`v1.0.0-beta.1` excluded). Minimum credentials
`permissions: contents: write` (FR-013). No `.bat` files (AGENTS.md).

**Scale/Scope**: One workflow file, one electron-builder config, two manifest
files, two update scripts, one README section. Draft/prerelease/rollback/
auto-update are out of scope (spec Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Release automation lives in GitHub Actions; the app (main/preload/renderer) is unchanged. No renderer Node surface is added or touched | **PASS** |
| II. Every Path Is Untrusted | No filesystem paths cross a trust boundary in this feature. Package definitions embed only release URLs and SHA-256 hashes derived from built artifacts in CI; the workflow runs on the trusted tag | **PASS** |
| III. Never Lose The User's Words | Nothing here reads or writes user documents; the save/atomic-write invariants are untouched | **PASS** |
| IV. Calm, Predictable Editing | CI-only feature; no runtime UX change | **PASS** |
| V. Test What Can Corrupt Or Escape | A Vitest contract suite validates the workflow trigger/gates/permissions, the Scoop manifest and Homebrew formula shape (URL/version/hash fields), and the README commands, so a regression in the release contract fails tests. The end-to-end release is validated manually via quickstart.md | **PASS** |

## Phase 0: research.md

All unknowns resolved — see [research.md](./research.md) R1–R9. Key decisions:

- R1: matrix build + single gated `release` job (`needs: build`,
  `fail-fast: false`, no `continue-on-error` on required legs) → all-or-nothing.
- R2: trigger glob `v[0-9]+.[0-9]+.[0-9]+` (glob, not regex: `.` literal, `[0-9]`
  char class, `+` one-or-more); version = tag minus `v`. The strict
  `^v[0-9]+\.[0-9]+\.[0-9]+$` regex is enforced in a cheap `validate` job.
- R3: reachability gate `git merge-base --is-ancestor <tag> refs/remotes/origin/main`,
  moved into `validate` so a bad/non-main/duplicate tag never burns build legs.
- R4: matrix `windows-latest` (x64), `macos-15-intel` (x64), `macos-latest`
  (arm64), `ubuntu-latest` (x64); names embed os-arch-version (FR-005).
- R5: `electron-builder --publish never` on build legs, plus
  `--config.extraMetadata.version=<VERSION>` so artifact names and the embedded
  app version come from the tag, not `package.json` (FR-003); a guard step fails
  if `package.json`'s version differs from the tag.
- R6: Scoop portable zip + `scoop/another-markdown-editor.json`; Homebrew
  formula (not cask) serving macOS zip + Linux AppImage (with a linux-arm64
  `odie` guard); `.ps1` update scripts that `throw` on a missing artifact.
- R7: `tests/release/` contract suite; existing suites as regression gate.
- R8: draft-release → update + commit manifests on `main` → publish the draft,
  so a public release can never exist with stale/missing definitions (replaces
  the earlier release-before-manifest ordering).
- R9: workflow default `permissions: contents: read`; `contents: write`
  job-scoped to `release` only.

## Phase 1: data-model.md, contracts, quickstart.md

- [data-model.md](./data-model.md) — ReleaseTag, ReleaseArtifact, PackageDefinition,
  ReleaseWorkflow entities and validation rules.
- [contracts/release.md](./contracts/release.md) — the release contract: trigger,
  matrix legs, artifact naming + required set, Scoop manifest schema, Homebrew
  formula schema, README install commands, credentials.
- [quickstart.md](./quickstart.md) — manual validation: fork → tag → release →
  install via brew/scoop.

## Project Structure

### Documentation (this feature)

```text
specs/005-release-distribution/
├── spec.md              # Requirements (existing)
├── plan.md              # This file
├── research.md          # R1–R9 evidence
├── data-model.md        # Entities + validation
├── quickstart.md        # Manual release/install validation
├── contracts/
│   └── release.md       # Workflow + artifact + manifest contracts
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
.github/workflows/
└── build-release.yml        # NEW: the release workflow (trigger, matrix, release job)

electron-builder.yml         # NEW: packaging config (appId, targets, artifactName)

scoop/
└── another-markdown-editor.json   # NEW: Scoop manifest (portable zip, sha256, bin)

Formula/
└── another-markdown-editor.rb     # NEW: Homebrew formula (macOS zip + Linux AppImage)

updatescoop.ps1              # NEW: compute zip hash, rewrite Scoop manifest
updatebrew.ps1               # NEW: compute hashes, rewrite Homebrew formula

README.md                    # MODIFY: add Installation section (brew + scoop)

package.json                 # MODIFY: add electron-builder devDependency, dist scripts
.gitignore                   # VERIFY: dist/ covered (already present)

tests/release/
└── release-contracts.test.ts  # NEW: contract tests for workflow/manifests/README
```

**Structure Decision**: Mirrors the referenced repositories
(`zolam`, `tinycity`) exactly — workflow at `.github/workflows/`, Scoop JSON in
the repo, formula under `Formula/`, `.ps1` update scripts at root. Package
definitions live in the project repository and the README directs users to add
the tap/bucket, per the spec's Assumptions.

## Complexity Tracking

> No constitution violations. The documented residual gap (release created
> before the manifest commit; R8) is an accepted operational ordering matched to
> the reference repos and is recorded in research.md, not a principle violation.

## Phase status

- Phase 1: Setup — verify baseline; add `electron-builder` + config + dist scripts
- Phase 2: Foundational — Scoop manifest, Homebrew formula, update scripts, README section
- Phase 3: US1 (P1) — the release workflow (trigger, matrix, reachability gate, release job)
- Phase 4: US2 (P1) — manifest updates wired into the release job; per-version install paths
- Phase 5: US3 (P2) — README installation section verified against the packaged artifacts
- Phase 6: US4 (P2) — all-or-nothing guarantees (needs: build, no continue-on-error, throw-on-missing scripts, fail_on_unmatched_files)
- Phase 7: Polish — contract tests, full gates (lint/typecheck/test/e2e), quickstart walk

**Status 2026-08-04**: All phases implemented and validated — 274 unit tests (18
release-contract), 102 e2e tests, lint and typecheck clean,
`electron-builder --dir` packages with exit 0, and both PowerShell update
scripts verified against a simulated v1.2.3 artifact set (correct hashes; throw
on missing artifact).

**Status 2026-08-05**: PR review fixes landed on the `005-release-distribution`
branch — tag-version wiring into packaging (`--config.extraMetadata.version`),
`package.json`-version guard, `validate` preflight job, draft→commit→publish
release ordering, commit-on-`main` (`branch: main`), SHA-pinned actions +
Dependabot, curated uploads, corrected artifact names in the spec artifacts,
linux-arm64 `odie` guard, and update-script polish. Contract tests updated to
pin the new workflow.

## Deferred / later features

- `yetanotherchris/homebrew-tap` repo creation (FR-012): required before
  `brew install yetanotherchris/tap/another-markdown-editor` works; recorded as
  an external dependency in spec.md `## Clarifications`. Out of band.
- `main` branch protection (release security review): the pipeline's real trust
  anchor is "who can write to main"; enable in GitHub settings as a follow-up.
- linux-arm64 build leg (R4) — add when upstream AppImage/Electron support warrants.
- macOS signing/notarization (spec Assumptions: out of scope).
- Auto-update (electron-builder `publish` provider / `latest*.yml`) — out of scope.
- Custom app icons for the packaged artifacts — default Electron icons used.
- Casks instead of formula for macOS-only installs — rejected (R6).

## Decision log (2026-08-04)

- `.github/workflows/build-release.yml` is the single source of truth for release
  mechanics; it is validated by `tests/release/release-contracts.test.ts`
  structure assertions rather than a YAML parse (research R7).
- Scoop installs a **portable zip** (not the NSIS installer) because Scoop
  installs via `bin` from an archive; NSIS installers need a machine-specific
  silent install (research R6).
- Homebrew installs via a **formula** (not a cask) so one definition serves macOS
  and Linux per FR-006 (research R6).
- macOS ships both x64 and arm64 artifacts; Linux x64 only (research R4).
- The release job writes SHA-256 hashes into both manifests from the *downloaded*
  artifacts, so the published checksums always match the published assets
  (FR-008); both update scripts `throw` when a required artifact is missing
  (FR-009/010).
- `artifactName` is set per-target so every asset name carries
  `productName-version-os-arch.ext` (FR-005).
- The version used for packaging is derived from the tag in each build leg via
  the same `v`-stripping logic as the release job (FR-003). Each leg passes
  `--config.extraMetadata.version=${{ steps.version.outputs.VERSION }}` to
  electron-builder so artifact names AND the embedded app version come from the
  tag, not `package.json`; a guard step additionally fails if `package.json`'s
  version does not equal the tag version (release-review CRITICAL fix).
- Third-party actions are pinned to full commit SHAs (checkout `fbc6f39`,
  setup-node `49933ea`, upload-artifact `b7c566a`, download-artifact `018cc2c`,
  softprops `3d0d988`, git-auto-commit `4a55954`) and kept current by Dependabot
  — a security-review hardening over the reference repos' mutable major-version
  tags.
- The release is created as a **draft**, the manifests are updated and committed
  to `main` (`git checkout -B main origin/main`), and only then is the draft
  published (softprops v3: `draft: true` → commit → publish with `draft`
  omitted). This closes the release-before-manifest gap (research R8, rewritten)
  and makes a public release with stale definitions impossible.
- The `yetanotherchris/tap` Homebrew tap is an **external dependency** that must
  exist (`github.com/yetanotherchris/homebrew-tap`) before FR-012 / SC-003 hold;
  recorded in spec.md `## Clarifications` and deferred until created out-of-band.
- `vitest.workspace.ts` is a legacy leftover: it imports `defineWorkspace`,
  which `vitest/config` in vitest 4.1.10 does not export (verified via ESM
  import), so vitest ignores it and loads `vitest.config.ts` (which uses
  `projects`). The `release` test project is therefore registered in
  `vitest.config.ts` (the active config); `vitest.workspace.ts` was updated too
  so the two never drift apart. The existing `defineWorkspace` LSP error in that
  file is pre-existing and unrelated to this feature.
