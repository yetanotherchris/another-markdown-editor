# Rename Contract: MarkdownMeister

Authoritative old→new mapping for spec 019. Every edit applies this map; the
verification task greps for the *old* strings (Table 2) to prove completeness.

## 1. Identity fields

| # | Old | New | Files |
|---|-----|-----|-------|
| 1 | `"name": "another-markdown-editor"` | `"name": "markdownmeister"` | `package.json`, `package-lock.json` (npm-regenerated) |
| 2 | `"productName": "Another Markdown Editor"` | `"productName": "MarkdownMeister"` | `package.json`, `electron-builder.yml` |
| 3 | `appId: com.yetanotherchris.another-markdown-editor` | `appId: com.yetanotherchris.markdownmeister` | `electron-builder.yml` |
| 4 | `executableName: ameditor` | `executableName: markdownmeister` | `electron-builder.yml` |
| 5 | `<title>Another Markdown Editor</title>` | `<title>MarkdownMeister</title>` | `src/renderer/index.html` |
| 6 | `appData/ame` (config folder) | `appData/markdownmeister` | `src/main/recentItemsPath.ts` + comments in `src/main/{settings.ts,settingsFile.ts,windowStateFile.ts,recentItems.ts,spellcheckDictionary.ts}` |
| 7 | `~/.config/ame` | `~/.config/markdownmeister` | `tests/e2e/recent-helpers.ts` comment |

## 2. Release assets

| # | Old pattern | New pattern | Files |
|---|-------------|-------------|-------|
| 8 | `ameditor-${version}-windows-${arch}.${ext}` | `markdownmeister-${version}-windows-${arch}.${ext}` | `electron-builder.yml` (win) |
| 9 | `ameditor-${version}-macos-${arch}.${ext}` | `markdownmeister-${version}-macos-${arch}.${ext}` | `electron-builder.yml` (mac) |
| 10 | `ameditor-${version}-linux-x64.${ext}` | `markdownmeister-${version}-linux-x64.${ext}` | `electron-builder.yml` (linux) |
| 11 | `dist/ameditor-*.{exe,zip,dmg,AppImage}` | `dist/markdownmeister-*.{exe,zip,dmg,AppImage}` | `.github/workflows/build-release.yml` upload globs |
| 12 | `ameditor-$VERSION-…` required set | `markdownmeister-$VERSION-…` | `.github/workflows/build-release.yml` verify step |
| 13 | `another-markdown-editor.json Formula/another-markdown-editor.rb` | `markdownmeister.json Formula/markdownmeister.rb` | `.github/workflows/build-release.yml` file_pattern |

## 3. Package definitions

| # | Old | New | Files |
|---|-----|-----|-------|
| 14 | `another-markdown-editor.json` (file) | `markdownmeister.json` (`git mv`) | repo root |
| 15 | manifest `url` `…/ameditor-0.0.96-windows-x64.zip` | `…/markdownmeister-0.0.96-windows-x64.zip` | `markdownmeister.json` |
| 16 | manifest `bin` `[ameditor.exe, ameditor]` | `[markdownmeister.exe, markdownmeister]` | `markdownmeister.json` |
| 17 | `Formula/another-markdown-editor.rb` (file) | `Formula/markdownmeister.rb` (`git mv`) | `Formula/` |
| 18 | `class AnotherMarkdownEditor` | `class Markdownmeister` | `markdownmeister.rb` |
| 19 | formula URLs `…/ameditor-0.0.96-{macos-arm64,macos-x64}.zip` + `…-linux-x64.AppImage` | `…/markdownmeister-0.0.96-…` | `markdownmeister.rb` |
| 20 | `odie "Another Markdown Editor does not provide…"` | `odie "MarkdownMeister does not provide…"` | `markdownmeister.rb` |
| 21 | `app.install "Another Markdown Editor.app"` + `assert_predicate prefix/"Another Markdown Editor.app"` | `"MarkdownMeister.app"` | `markdownmeister.rb` |
| 22 | `bin.install "…-linux-x64.AppImage" => "ameditor"` + `assert_predicate bin/"ameditor"` | `=> "markdownmeister"` | `markdownmeister.rb` |

## 4. Update scripts

| # | Old | New | Files |
|---|-----|-----|-------|
| 23 | `$fileName`/`$url` `ameditor-$Version-windows-x64.zip` | `markdownmeister-$Version-windows-x64.zip` | `updatescoop.ps1` |
| 24 | `manifestPath … another-markdown-editor.json` | `… markdownmeister.json` | `updatescoop.ps1` |
| 25 | three `$*File` names `ameditor-$Version-…` | `markdownmeister-$Version-…` | `updatebrew.ps1` |
| 26 | URL replace regexes + `bin.install` regex + expected guard | `markdownmeister-$Version-…`, `=> "markdownmeister"` | `updatebrew.ps1` |
| 27 | `$formulaPath … Formula/another-markdown-editor.rb` | `… Formula/markdownmeister.rb` | `updatebrew.ps1` |
| 28 | comments mentioning `ameditor` (spec 009) | `markdownmeister` (spec 019) | `updatebrew.ps1`, `updatescoop.ps1`, `electron-builder.yml` |

## 5. Source identifiers (full cleanup, user decision)

| # | Old | New | Files |
|---|-----|-----|-------|
| 29 | `AME_USER_DATA_DIR` | `MM_USER_DATA_DIR` | `src/main/index.ts`, `tests/e2e/launch.ts` |
| 30 | `AME_CONFIG_DIR` | `MM_CONFIG_DIR` | `src/main/recentItemsPath.ts`, `src/main/settings.ts`, `tests/e2e/launch.ts`, `tests/e2e/recent-helpers.ts` |
| 31 | `AME_E2E_HEADED` | `MM_E2E_HEADED` | `tests/e2e/launch.ts`, `playwright.config.ts` |
| 32 | CSS tokens `--ame-*` | `--mm-*` | `src/renderer/**/*.css`, `tests/e2e/{theme,source,header-bar-shade}.spec.ts` |
| 33 | `.ame-spelling-error` | `.mm-spelling-error` | `src/renderer/editor/editor.css`, `src/renderer/editor/spellcheckPlugin.ts`, `tests/e2e/spellcheck.spec.ts` |
| 34 | `PluginKey('ame-spellcheck')` | `PluginKey('mm-spellcheck')` | `src/renderer/editor/spellcheckPlugin.ts` |
| 35 | temp prefixes `'ame-…'` | `'mm-…'` | `tests/main/**`, `tests/renderer/**`, `tests/e2e/**` |

## 6. Docs and specs

| # | Old | New | Files |
|---|-----|-----|-------|
| 36 | `# Another Markdown Editor — Design Decisions` | `# MarkdownMeister — Design Decisions` | `docs/DESIGN_DECISIONS.md` (repo-URL line unchanged) |
| 37 | README title / brew formula / scoop install / launch command | `markdownmeister`; `brew install yetanotherchris/tap/markdownmeister`; `scoop bucket add markdownmeister <repo-url>`; `scoop install markdownmeister`; launch `markdownmeister` | `README.md` |
| 38 | `# Another Markdown Editor Constitution` | `# MarkdownMeister Constitution` (+ PATCH amendment) | `.specify/memory/constitution.md` |
| 39 | spec 006 working name `another-markdown-editor` | `markdownmeister` | `specs/006-file-association/spec.md` |
| 40 | spec 022 config path `~/.config/another-markdown-editor/…`, seams `AME_CONFIG_DIR`, migration sources `…/ame/…` | `~/.config/markdownmeister/…`, `MM_CONFIG_DIR`, `…/markdownmeister/…` + `## Clarifications` entry | `specs/022-universal-config-path/spec.md` |

## Table: Strings that MUST NOT change

- `https://github.com/yetanotherchris/another-markdown-editor` — the repo URL
  (and the bare `yetanotherchris/another-markdown-editor`), everywhere it names
  the GitHub repository (README install URLs, manifests' `homepage` + download
  URLs, `updatebrew.ps1`/`updatescoop.ps1` base URLs, spec 007,
  `docs/DESIGN_DECISIONS.md` input line). R5 / spec Assumptions.
- `specs/archive/**` — historical records, untouched.
- `node_modules/`, build output (`dist/`, `out/`, `release/`), `package-lock.json`
  contents beyond the root `name`.
- Manifest `version` and SHA256 hashes — regenerated by the release workflow on
  the next tag (R4).
