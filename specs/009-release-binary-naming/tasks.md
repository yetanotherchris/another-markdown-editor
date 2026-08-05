# Tasks: Release Binary Naming

**Feature**: `009-release-binary-naming` | **Date**: 2026-08-04

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/release.md](./contracts/release.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: The rename is a single mechanical change across
seven files plus the spec artifacts. Order matters only for keeping the suite
green at the end: change the source of truth (`electron-builder.yml`) first,
then the workflow, then the scripts and manifests, then the tests, then run the
gates.

---

## Phase 1: Implementation

- [X] T001 Change `artifactName` in `electron-builder.yml` from
      `Another Markdown Editor-${version}-<os>-${arch}.${ext}` to
      `ameditor-${version}-<os>-${arch}.${ext}` for the `win` (windows), `mac`
      (macos), and `linux` blocks (the literal os tokens stay as they are).
      (Spec FR-001/002.)
- [X] T002 Change `.github/workflows/build-release.yml`:
      - the upload globs `dist/Another Markdown Editor-*.{exe,zip,dmg,AppImage}`
        → `dist/ameditor-*.{exe,zip,dmg,AppImage}`;
      - the seven entries in the `Verify required artifact set` step to the
        `ameditor-$VERSION-...` names.
      (Spec FR-003.)
- [X] T003 Change `updatescoop.ps1`: `$fileName` and the manifest `url` to
      `ameditor-$Version-windows-x64.zip` (the URL no longer needs `%20`
      encoding for the prefix).
- [X] T004 Change `updatebrew.ps1`: the three `$*File` names, the three URL
      replace regexes, and the `bin.install` replace regex to the `ameditor-*`
      names.
- [X] T005 Change `another-markdown-editor.json`: `architecture.64bit.url`
      to the `ameditor-0.0.83-windows-x64.zip` URL (keep `bin` unchanged).
- [X] T006 Change `Formula/another-markdown-editor.rb`: the three per-arch URLs
      and the Linux `bin.install "Another Markdown Editor-0.0.83-linux-x64.AppImage"`
      to the `ameditor-*` names (keep `app.install "Another Markdown Editor.app"`
      unchanged).
- [X] T007 Update `tests/release/release-contracts.test.ts` to assert the
      renamed names (upload globs, required set, Scoop URL, formula `bin.install`),
      and reconcile the stale `0.1.0` version assertions to the current `0.0.83`
      (the suite was already failing on `main` for that reason).

## Phase 2: Verify

- [X] T008 Run `npm run test` (release-contract tests must pass), `npm run lint`,
      and `npm run typecheck`.
- [X] T009 Confirm no remaining `Another Markdown Editor-` asset-name references
      in the release pipeline (grep the workflow, scripts, manifests, formula,
      and tests).

**Checkpoint**: all gates green; contract tests assert `ameditor-*` names.

## Follow-up (2026-08-05)

- [X] T010 Remove the release-contract suite (`tests/release/release-contracts.test.ts`
      deleted; vitest project, eslint override, and spec 005 Test contract removed).
      Release verification is manual via quickstart.md (plan Decision log).
- [X] T011 Fix the Scoop/Homebrew command name to `ameditor` (spec 009 FR-004):
      `another-markdown-editor.json` bin maps `ameditor.exe` → `ameditor`;
      `Formula/another-markdown-editor.rb` installs the Linux AppImage as
      `bin/ameditor`; `updatebrew.ps1` rewrites the URL tag and guards the
      `ameditor` command name.
