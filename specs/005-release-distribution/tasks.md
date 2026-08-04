# Tasks: Release Distribution

**Feature**: `005-release-distribution` | **Date**: 2026-08-04

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Implementation strategy**: Build the packaging engine first — the
`electron-builder` config and the two PowerShell manifest-update scripts
(Phase 2) — because the workflow (Phase 3+) invokes them. Then author the
release workflow: matrix build that only packages (`--publish never`), a single
gated `release` job that verifies the tag is reachable from `main`, downloads
and verifies the full required artifact set, creates the GitHub Release with
`fail_on_unmatched_files`, and finally rewrites + commits the Scoop manifest and
Homebrew formula. The README install section (US3) and the all-or-nothing
hardening audit (US4) follow, then the `tests/release` contract suite pins every
contract so a regression fails the unit suite.

The required artifact set, names, manifests, and failure contract are pinned in
`contracts/release.md` and enforced by `tests/release/release-contracts.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline and prepare packaging tooling.

- [X] T001 Establish a green baseline on the `005-release-distribution` branch:
      run `npm run lint`, `npm run typecheck`, `npm run test`, and confirm the e2e
      suite currently passes (`npm run test:e2e`). Record the results in this
      file. Confirm `spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/release.md`, `quickstart.md` are present.
      (Result: lint clean, typecheck clean, 256 unit tests pass, 102 e2e tests
      pass; all artifacts present and consistent.)
- [X] T002 Add `electron-builder` to `devDependencies` in `package.json`
      (constitution-fixed packaging tool; research R5) and add `"dist":
      "npm run build && electron-builder"` and `"dist:dir": "npm run build &&
      electron-builder --dir"` scripts. Verify `.gitignore` already covers
      `dist/` and `out/` (it does — confirm, do not duplicate) and that
      `eslint.config.mjs` `ignores` already covers `dist/` (it does — confirm).
      (Result: `electron-builder@^26.15.3` added; `dist`/`dist:dir` scripts added;
      `.gitignore` covers `out`/`dist`; eslint `ignores` covers `out/`/
      `node_modules/`/`dist/`.)

**Checkpoint**: `npm run test` still green after the dependency addition; ignore
files cover the build output.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the packaging config and the manifest-update scripts exist before the
workflow references them.**

- [X] T003 Create `electron-builder.yml`: `appId: com.yetanotherchris.another-markdown-editor`,
      `productName` from package.json, `directories.output: dist`, `files`
      including `out/**` (the electron-vite build output) and excluding
      `src/**`/config/test artifacts, and per-OS targets —
      Windows: `nsis` + `zip` (x64), macOS: `dmg` + `zip` (x64 + arm64),
      Linux: `AppImage` (x64). Set `artifactName` templates to
      `Another Markdown Editor-${version}-${os}-${arch}.${ext}` so every asset
      name carries product-version-os-arch (FR-005, research R4/R5).
      (Result: `electron-builder.yml` created; `npx electron-builder --dir --x64`
      packages `dist/win-unpacked` with exit 0. Note: `${os}` renders the
      electron-builder token `win`/`mac`/`linux`, so the literal os token in each
      platform block is `windows`/`macos`/`linux` — the artifactName string uses
      a literal token, verified by the package run.)
- [X] T004 Create `updatescoop.ps1` (AGENTS.md: `.ps1`, never `.bat`): takes a
      mandatory `-Version`; locates the Windows portable zip artifact
      (`dist/Another Markdown Editor-$Version-windows-x64.zip`, research R6);
      `throw`s if absent; computes `Get-FileHash -Algorithm SHA256` (lowercase);
      reads `scoop/another-markdown-editor.json`, sets `version`, the
      `architecture.64bit.url` (release download URL for the zip) and
      `architecture.64bit.hash`, and writes it back (FR-007/008).
- [X] T005 Create `updatebrew.ps1`: takes a mandatory `-Version`; locates the
      macOS arm64/x64 zips and the Linux AppImage
      (`dist/Another Markdown Editor-$Version-macos-*.zip`,
      `dist/Another Markdown Editor-$Version-linux-x64.AppImage`); `throw`s if
      any is absent; computes lowercase SHA-256 for each; rewrites
      `Formula/another-markdown-editor.rb` version, per-arch URLs and sha256
      lines, and the `bin.install`/`app.install` filenames (FR-006/008, research R6).

**Checkpoint**: the two scripts and the packaging config exist and reference the
same artifact names as `contracts/release.md` §2.

---

## Phase 3: US1 — Publish a versioned desktop release (P1)

**Goal**: pushing a `vMAJOR.MINOR.PATCH` tag whose target is reachable from
`main` builds verified artifacts for every platform and publishes one release
(FR-001…FR-005, US1 scenarios 1–4).

**Independent Test**: quickstart.md §3 on a fork; contract test T014.

### Implementation

- [X] T006 [US1] Create `.github/workflows/build-release.yml`: trigger
      `on.push.tags` with exactly `'v[0-9]+.[0-9]+.[0-9]+'` (FR-001; research R2),
      workflow-default `permissions: contents: read` with `contents: write`
      scoped to the `release` job only (FR-013), a `validate` preflight job
      (strict semver regex, reachability gate, no-existing-release check), and
      the `build` job — matrix of the four legs from research R4
      (`windows-latest`, `macos-15-intel`, `macos-latest`, `ubuntu-latest`) with
      `fail-fast: false` and NO `continue-on-error` on any required leg
      (FR-010); each leg: checkout (fetch-depth 0), setup-node + `npm ci`,
      `npm run build`, then `npx electron-builder --publish never` with the
      leg's platform/arch AND `--config.extraMetadata.version=<VERSION>`
      (FR-003); the release job syncs `package.json`'s version to the tag via
      `updatepackagejson.ps1` (committed to `main` with the manifests);
      macOS legs set `CSC_IDENTITY_AUTO_DISCOVERY=false`; each leg uploads its
      curated `dist/Another Markdown Editor-*.{exe,zip,dmg,AppImage}` output via
      `actions/upload-artifact` (SHA-pinned) with `if-no-files-found: error`
      (FR-010).
      (Result: `.github/workflows/build-release.yml` created with the strict tag
      glob, job-scoped credentials, the `validate` preflight, the four-leg
      matrix with `fail-fast: false`, no `continue-on-error`, tag-version
      wiring into packaging, and the `package.json`-version guard.)
- [X] T007 [US1] Add the `release` job to the same workflow (sequential — same
      file): `needs: build`, `if: github.ref_type == 'tag'`, `runs-on:
      ubuntu-latest`, `permissions: contents: write`. Steps: (1) checkout
      `fetch-depth: 0`; (2) determine `VERSION` = `github.ref_name` minus
      leading `v` (FR-003); (3) download all artifacts
      (`actions/download-artifact`, merge-multiple); (4) verify the full
      required set from `contracts/release.md` §2 exists before creating any
      release (FR-009); (5) create the release as a **draft** with
      `softprops/action-gh-release` (SHA-pinned v3) — `draft: true`,
      `files` = all artifacts, `fail_on_unmatched_files: true`,
      `generate_release_notes: true` (FR-004/010).
      (Result: `release` job added with `needs: build`, artifact-set
      verification, and a draft-release step; the reachability gate lives in the
      `validate` job.)

**Acceptance**: a valid main-reachable tag yields exactly one release with every
required artifact; a malformed or non-main tag yields none (US1 scenarios 1–4).

---

## Phase 4: US2 — Install through familiar package managers (P1)

**Goal**: Homebrew and Scoop install the same version the release tag names,
each referencing the verified checksum of its artifact (FR-006…FR-008, US2
scenarios 1–4).

**Independent Test**: quickstart.md §4; contract test T014.

### Implementation

- [X] T008 [US2] Create `scoop/another-markdown-editor.json` — a valid Scoop
      manifest with `version: 0.1.0` (placeholder), `description`, `homepage`,
      `license`, and `architecture.64bit` containing `url`, `hash` (all-zero
      placeholder) and `bin: [["Another Markdown Editor.exe",
      "another-markdown-editor"]]` (contracts §3; `updatescoop.ps1` fills the
      real version/url/hash at release time).
- [X] T009 [US2] Create `Formula/another-markdown-editor.rb` — a Homebrew
      formula class `AnotherMarkdownEditor` with `version "0.1.0"`, an
      `on_macos do … end` block (arm64 and x64 zip urls + sha256 placeholders)
      and an `on_linux do … end` block (AppImage url + sha256), `app.install` on
      macOS and `bin.install` of the AppImage on Linux (contracts §4;
      `updatebrew.ps1` fills real values). A formula, not a cask, so it serves
      macOS and Linux per FR-006 (research R6).
- [X] T010 [US2] Wire the manifest updates into the `release` job (sequential —
      same workflow file): after the draft release is created, checkout `main`
      explicitly (`git checkout -B main origin/main` + `git pull --rebase origin
      main`), run `pwsh ./updatescoop.ps1 -Version $VERSION` and
      `pwsh ./updatebrew.ps1 -Version $VERSION` (from the downloaded artifacts),
      then commit `scoop/another-markdown-editor.json` and
      `Formula/another-markdown-editor.rb` to `main` via
      `stefanzweifel/git-auto-commit-action` (SHA-pinned v7) with `branch: main`
      (research R1/R6/R8). Finally publish the draft (a second `softprops`
      invocation with `tag_name` and `draft` omitted). Both scripts `throw` on a
      missing artifact, so a failed build can never reach the commit (FR-010,
      US4 scenario 2).
      (Result: `git checkout -B main` step, `pwsh ./updatescoop.ps1` and
      `pwsh ./updatebrew.ps1` steps, `git-auto-commit-action` with `branch: main`
      committing the two manifest files, and a final publish-draft step. The
      explicit `main` checkout was required because a tag push checks out a
      detached HEAD, which broke the manifest commit.)

**Acceptance**: a published `v1.0.0` is installable via the documented brew and
scoop commands at version `1.0.0`, and each definition carries the exact
checksum of its published asset (US2 scenarios 1–3).

---

## Phase 5: US3 — Follow documented installation instructions (P2)

**Goal**: the README has a clearly headed, copyable installation section
(FR-011/FR-012, US3 scenarios 1–4).

**Independent Test**: quickstart.md §5; contract test T014.

### Implementation

- [X] T011 [US3] Add a `## Installation` section to `README.md` containing the
      verbatim Homebrew example (`brew install
      yetanotherchris/tap/another-markdown-editor`) and Scoop example
      (`scoop bucket add another-markdown-editor
      https://github.com/yetanotherchris/another-markdown-editor` then
      `scoop install another-markdown-editor`), matching the package names in
      the manifests (contracts §5). Keep the existing repo blurb; the section
      must install the current versioned release without building from source
      (FR-012).

**Acceptance**: a new user can copy the platform command from the README and
install the current release (US3 scenarios 1–4).

---

## Phase 6: US4 — Trust failed releases not to appear (P2)

**Goal**: no release or package-definition update is visible unless every
required artifact and checksum is present and verified (FR-009/FR-010, US4
scenarios 1–3).

**Independent Test**: code audit against `contracts/release.md` §6; contract
test T014.

### Implementation

- [X] T012 [US4] Audit the workflow and scripts against `contracts/release.md`
      §6 and harden any gap: confirm `needs: build` + no `continue-on-error` on
      required legs (a failed leg ⇒ no release), the reachability gate, the
      required-set verification and `fail_on_unmatched_files` (a missing asset
      ⇒ no release), and both update scripts `throw`ing on a missing artifact
      (a missing artifact ⇒ no manifest commit). Fix `build-release.yml` /
      `updatescoop.ps1` / `updatebrew.ps1` where any invariant is not yet met,
      and record any deviation in `plan.md`'s decision log (AGENTS.md).
      (Result: audit PASS — all §6 invariants present in the workflow and both
      scripts; no deviation to record. The review-driven changes (draft release
      ordering, commit-on-`main`, job-scoped permissions, SHA pinning) are
      recorded in T016 and in plan.md's decision log / research R8/R9.)

**Acceptance**: the workflow publishes nothing — neither release nor manifest
commit — when any required build or verification fails (US4 scenarios 1–2); a
successful run leaves release and manifests consistent (US4 scenario 3).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: pin the release contract in the unit suite and run the full gates.

- [X] T013 [P] Add a `release` project to the Vitest configs so the contract
      suite runs under `npm run test`: add `tests/release/**/*.test.ts` with
      `environment: 'node'` to both `vitest.config.ts` and `vitest.workspace.ts`
      (whichever vitest actually loads — both are updated to be safe), and add
      a `files: ['tests/release/**/*.ts']` rule to `eslint.config.mjs` that
      allows `fs`/`path` imports in the tests (it reads the committed release
      artifacts; `no-restricted-imports` would otherwise block it).
      (Result: `release` project added to `vitest.config.ts` (active config —
      `vitest.workspace.ts` uses `defineWorkspace`, which vitest 4.1.10 does not
      export and ignores) and `vitest.workspace.ts` (kept consistent);
      `eslint.config.mjs` rule added for `tests/release/**/*.ts`.)
- [X] T014 [US1] [US2] [US3] [US4] Write `tests/release/release-contracts.test.ts`
      enforcing `contracts/release.md` §7 against the committed files: workflow
      has the exact tag regex, `permissions: contents: write`, the four matrix
      legs with `fail-fast: false` and no `continue-on-error`, `--publish never`
      on build legs, `CSC_IDENTITY_AUTO_DISCOVERY=false` on macOS legs,
      `needs: build`, the `merge-base --is-ancestor` reachability step,
      `fail_on_unmatched_files: true`, `updatescoop.ps1`/`updatebrew.ps1`
      invocation and `git-auto-commit-action`; the Scoop manifest parses as JSON
      with the required `version`/`architecture.64bit.{url,hash,bin}` fields;
      the formula has the class name, `version` line, `on_macos`/`on_linux`
      blocks, `sha256` and `app.install`/`bin.install`; the README has
      `## Installation` and the two exact commands.
      (Result: 18 contract tests added; the full suite runs 274 tests and all
      pass.)
- [X] T015 Run the full quickstart Automate line — `npm run lint`, `npm run
      typecheck`, `npm run test`, `npm run test:e2e` — all green; verify
      `npx electron-builder --dir --x64` (or the local-OS equivalent) packages
      the app with no config errors; verify plan/research/data-model/contracts
      are consistent with the final files and mark this task `[X]` only then.
      (Result: lint clean, typecheck clean, 274 unit tests pass (incl. 18
      release-contract tests), 102 e2e tests pass, `electron-builder --dir
      --x64` exits 0 and produces `dist/win-unpacked`. The PowerShell update
      scripts were additionally exercised against a simulated v1.2.3 artifact
      set — both rewrite their manifest/formula with the computed SHA-256 and
      both `throw` when a required artifact is missing.)

**Checkpoint**: the release contract is pinned by tests, the four-command gate
passes, and a local `--dir` packaging run succeeds.

---

## Phase 8: PR review fixes (2026-08-05)

**Purpose**: close the findings from the PR #14 review (5 reviews, same-model
subagents) that broke the pipeline or drifted from the contract.

- [X] T016 [P] Apply the release-review fixes:
      - **Tag-version wiring (CRITICAL, FR-003):** pass
        `--config.extraMetadata.version=${{ steps.version.outputs.VERSION }}` to
        every `electron-builder` packaging step so artifact names and the
        embedded app version come from the tag, not `package.json`; add a guard
        step that fails when `package.json`'s version != tag version.
      - **Commit on `main` (HIGH, FR-006/007/008):** explicit
        `git checkout -B main origin/main` + `git pull --rebase origin main`
        before the update scripts, and `branch: main` on
        `git-auto-commit-action` v7 (a tag push checks out detached HEAD).
      - **Release ordering (MEDIUM/HIGH, FR-009/010):** draft release →
        update + commit manifests → publish draft, so a public release can never
        exist with stale/missing definitions (research R8 rewritten).
      - **`validate` preflight job:** strict semver regex, reachability gate,
        and "no existing release for tag" check before the build matrix.
      - **Security hardening (MEDIUM):** SHA-pin all six third-party actions and
        add `.github/dependabot.yml`; job-scope `permissions` (`contents: write`
        only on `release`); curate uploads to the installer files only.
      - **Documentation drift (MEDIUM):** corrected artifact names
        (`-windows-x64.exe` / `-windows-x64.zip`, not `-setup` / `-portable`) in
        data-model.md / contracts/release.md / quickstart.md; glob-vs-regex
        wording for the trigger.
      - **Linux arm64 (LOW):** `odie` guard in the formula's `on_linux` block.
      - **Update scripts (LOW):** trailing newline in `updatescoop.ps1`; CRLF
        normalization in `updatebrew.ps1`.
      - **Homebrew tap (HIGH, FR-012):** `yetanotherchris/homebrew-tap` does not
        exist. Recorded as an external dependency in spec.md `## Clarifications`
        and quickstart.md prerequisites; creating/publishing the tap is
        out-of-band and must happen before FR-012 / SC-003 hold.
      (Result: all in-repo review fixes landed on the branch; contract tests
      updated to pin the new workflow; see plan.md decision log + research
      R2/R8/R9. Out-of-band GitHub items remain: create `homebrew-tap`,
      enable `main` branch protection.)

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–6 (workflow calls the scripts; scripts need artifact names) |
| Phase 3: US1 workflow | Phase 2 | Phase 4 (release job runs the scripts) |
| Phase 4: US2 manifests | Phase 3 | Phase 7 |
| Phase 5: US3 README | Phase 2 | Phase 7 |
| Phase 6: US4 hardening | Phase 3 | Phase 7 |
| Phase 7: Polish | Phases 3–6 | Phase 8 |
| Phase 8: Review fixes | Phase 7 | — (out-of-band: tap repo, branch protection) |

### Parallel Opportunities

- T003, T004, T005 touch disjoint files (`electron-builder.yml` /
  `updatescoop.ps1` / `updatebrew.ps1`) and can run together.
- T008, T009, T011 touch disjoint files (`scoop/…json` / `Formula/….rb` /
  `README.md`) and can run together.
- T006 then T007 then T010 are sequential — they all edit
  `.github/workflows/build-release.yml`.
- T012 is an audit that may edit the workflow and scripts — run after T007/T010.
- T013 and T014 are sequential in the same area (T013 makes the suite runnable;
  T014 adds the tests). T015 depends on everything.

### High-level guarantee

The workflow is the single release authority: a tag triggers it only with the
exact `vMAJOR.MINOR.PATCH` shape, the release job runs only when every required
build leg succeeded and the tag is reachable from `main`, and it publishes
nothing until the full artifact set is present and verified. The manifests and
README all reference the same package names and version, and every definition
carries the SHA-256 computed from its published artifact (FR-008). No release or
manifest update is visible for a failed build or verification (FR-010).

---

## Notes

- [P] tasks touch disjoint files; the workflow-file tasks (T006, T007, T010,
  T012) are strictly sequential.
- The release workflow cannot be executed locally; the tag→release→install flow
  is validated on a fork per quickstart.md, and every machine-checkable contract
  is pinned by `tests/release/release-contracts.test.ts` (research R7).
- `.ps1` scripts are used for all PowerShell (AGENTS.md: never `.bat`).
- The existing Playwright e2e suite covers the app's user-visible behaviour and
  must remain green throughout (this feature adds no renderer surface).
- MVP = end of Phase 3 (US1): tagged main revisions produce a complete multi-
  platform release. Phases 4–6 add package-manager distribution, README, and
  failure-safety hardening.
- Deviations from the research/plan must be written there per AGENTS.md; the
  artifact set and failure contract live in `contracts/release.md` and are
  enforced by the contract tests.
