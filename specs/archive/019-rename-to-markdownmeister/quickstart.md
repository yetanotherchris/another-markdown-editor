# Quickstart: Rename Application to MarkdownMeister

Runnable validation scenarios proving the rename end-to-end. Full naming map:
[contracts/rename.md](./contracts/rename.md).

## Prerequisites

- `npm ci` run once (the suite needs `node_modules`).
- A build: `npm run build`.

## Verify the running application (US1)

1. Launch the built app: `npm run dist:dir` (or `npx electron .` after
   `npm run build`).
2. **Window title**: the title bar and taskbar tooltip show `MarkdownMeister`
   (HTML `<title>`, FR-001/010).
3. **Package identity**: inspect the packaged output — the launcher binary is
   `markdownmeister` (`markdownmeister.exe` on Windows), the macOS bundle is
   `MarkdownMeister.app`, and the app ID is `com.yetanotherchris.markdownmeister`
   (FR-002/003/005).
4. Automated check: `npx playwright test tests/e2e/rename.spec.ts` asserts the
   window title.

## Verify source is fully renamed (US4 / SC-002)

From the repo root, each command must print **zero** matches (archived specs,
`node_modules`, `dist/`, `out/`, and `package-lock.json` contents are exempt):

```sh
rg -i -l "ameditor|another[ _-]?markdown[ _-]?editor" --glob '!specs/archive/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!out/**' --glob '!release/**' .
rg -rn "AME_|--ame-|\.ame-spelling-error|'ame-" src/ tests/ playwright.config.ts
```

The first command is expected to still match lines that are the GitHub repo URL
(`github.com/yetanotherchris/another-markdown-editor`) — that URL is the one
documented exception (spec Assumptions); review any other match.

## Verify package definitions (US3)

1. `markdownmeister.json` exists at the repo root (renamed from
   `another-markdown-editor.json`); `bin` maps `markdownmeister.exe` →
   `markdownmeister`; the download URL uses `markdownmeister-0.0.96-windows-x64.zip`.
2. `Formula/markdownmeister.rb` exists; `class Markdownmeister`; `bin.install` is
   `markdownmeister`; macOS installs `MarkdownMeister.app`.
3. The next tagged release re-runs `updatescoop.ps1`/`updatebrew.ps1`, which
   regenerate both files with the new hashes (version/hash are intentionally not
   touched by this feature — the renamed assets only exist after that release).

## Verify the release pipeline (US2/US5)

1. Grep `.github/workflows/build-release.yml` for `markdownmeister` — the upload
   globs, the required-artifact set, and the auto-commit `file_pattern` must all
   use it (and no `ameditor` remains).
2. Grep `updatescoop.ps1` / `updatebrew.ps1` for `ameditor` — zero matches;
   both reference `markdownmeister`.

## Regression gates

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

All must pass (SC-006). The e2e suite includes the new `tests/e2e/rename.spec.ts`.
