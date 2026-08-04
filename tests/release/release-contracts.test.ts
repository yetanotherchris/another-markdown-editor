/**
 * Contract tests for the release distribution feature (spec 005).
 *
 * These validate the COMMITTED release artifacts (workflow, Scoop manifest,
 * Homebrew formula, README) so a regression in the release contract fails the
 * unit suite without needing to run GitHub Actions (research R7). The assertions
 * mirror contracts/release.md §7. The workflow is asserted structurally (text
 * checks), deliberately NOT parsed as YAML because GitHub workflows use the
 * reserved `on:` key and the `yaml` dependency is deliberately avoided (R7).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..', '..')

const WORKFLOW = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-release.yml'), 'utf8')
const SCOOP_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scoop', 'another-markdown-editor.json'), 'utf8')
)
const FORMULA = fs.readFileSync(path.join(ROOT, 'Formula', 'another-markdown-editor.rb'), 'utf8')
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')

describe('release workflow contract (.github/workflows/build-release.yml)', () => {
  it('triggers only on the exact stable-semver tag regex (FR-001)', () => {
    expect(WORKFLOW).toMatch(/tags:/)
    expect(WORKFLOW).toContain("'v[0-9]+.[0-9]+.[0-9]+'")
    // no workflow_dispatch trigger: a release must only ever come from a tagged push
    expect(WORKFLOW).not.toMatch(/workflow_dispatch:/)
  })

  it('declares the minimum credentials (FR-013)', () => {
    expect(WORKFLOW).toMatch(/permissions:/)
    expect(WORKFLOW).toMatch(/contents:\s*write/)
    // no other permission scope or secrets
    expect(WORKFLOW).not.toMatch(/packages:\s*write/)
    expect(WORKFLOW).not.toMatch(/secrets:/)
  })

  it('has the four required matrix legs with fail-fast: false and no continue-on-error (FR-004/010)', () => {
    expect(WORKFLOW).toContain('fail-fast: false')
    for (const runner of ['windows-latest', 'macos-15-intel', 'macos-latest', 'ubuntu-latest']) {
      expect(WORKFLOW).toContain(runner)
    }
    expect(WORKFLOW).not.toMatch(/continue-on-error:/)
  })

  it('builds with --publish never (research R5)', () => {
    const packageSteps = WORKFLOW.match(/run:\s*npx electron-builder[^\n]*/g) ?? []
    expect(packageSteps.length).toBeGreaterThanOrEqual(3)
    for (const step of packageSteps) {
      expect(step).toContain('--publish never')
    }
  })

  it('disables macOS signing discovery (R5, spec Assumptions)', () => {
    expect(WORKFLOW).toMatch(/CSC_IDENTITY_AUTO_DISCOVERY:\s*'false'/)
  })

  it('runs the release job only after every build leg and only on a tag (FR-010)', () => {
    expect(WORKFLOW).toMatch(/needs:\s*build/)
    expect(WORKFLOW).toMatch(/github\.ref_type == 'tag'/)
    expect(WORKFLOW).toMatch(/if-no-files-found:\s*error/)
  })

  it('gates release on main-branch reachability of the tag (FR-002, US1 s4)', () => {
    expect(WORKFLOW).toMatch(/merge-base --is-ancestor/)
    expect(WORKFLOW).toMatch(/refs\/remotes\/origin\/main/)
  })

  it('verifies the full artifact set before publishing (FR-009/010)', () => {
    // the verification step enumerates every required artifact name
    const setStep = WORKFLOW.match(/required=\(([\s\S]*?)\n\s*\)/) ?? []
    expect(setStep).not.toHaveLength(0)
    for (const asset of [
      'windows-x64.exe',
      'windows-x64.zip',
      'macos-x64.dmg',
      'macos-x64.zip',
      'macos-arm64.dmg',
      'macos-arm64.zip',
      'linux-x64.AppImage'
    ]) {
      expect(setStep[1]).toContain(asset)
    }
  })

  it('creates the release with fail_on_unmatched_files (FR-010)', () => {
    expect(WORKFLOW).toMatch(/softprops\/action-gh-release@v2/)
    expect(WORKFLOW).toMatch(/fail_on_unmatched_files:\s*true/)
  })

  it('runs both manifest update scripts and commits them (FR-006/007/008)', () => {
    expect(WORKFLOW).toMatch(/updatescoop\.ps1/)
    expect(WORKFLOW).toMatch(/updatebrew\.ps1/)
    expect(WORKFLOW).toMatch(/stefanzweifel\/git-auto-commit-action@v5/)
    expect(WORKFLOW).toMatch(/scoop\/another-markdown-editor\.json/)
    expect(WORKFLOW).toMatch(/Formula\/another-markdown-editor\.rb/)
  })
})

describe('Scoop manifest contract (scoop/another-markdown-editor.json)', () => {
  it('is valid JSON with the required fields (contracts §3)', () => {
    expect(SCOOP_MANIFEST.version).toBe('0.1.0')
    expect(SCOOP_MANIFEST.homepage).toBe('https://github.com/yetanotherchris/another-markdown-editor')
    expect(typeof SCOOP_MANIFEST.description).toBe('string')
    expect(SCOOP_MANIFEST.license).toBe('MIT')
  })

  it('references the windows portable zip with a sha256 hash and bin mapping (FR-007/008)', () => {
    const arch = SCOOP_MANIFEST.architecture['64bit']
    expect(arch).toBeDefined()
    expect(arch.url).toMatch(/v0\.1\.0\/Another%20Markdown%20Editor-0\.1\.0-windows-x64\.zip$/)
    expect(arch.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(arch.bin).toEqual([['Another Markdown Editor.exe', 'another-markdown-editor']])
  })
})

describe('Homebrew formula contract (Formula/another-markdown-editor.rb)', () => {
  it('is a formula (not a cask) with the right class and metadata (FR-006)', () => {
    expect(FORMULA).toMatch(/^class AnotherMarkdownEditor < Formula/)
    expect(FORMULA).toMatch(/version "0\.1\.0"/)
    expect(FORMULA).toMatch(/homepage "https:\/\/github\.com\/yetanotherchris\/another-markdown-editor"/)
    expect(FORMULA).toMatch(/license "MIT"/)
  })

  it('has on_macos (arm64 + x64) and on_linux blocks with urls and sha256 (FR-006/008)', () => {
    expect(FORMULA).toMatch(/on_macos do/)
    expect(FORMULA).toMatch(/Hardware::CPU\.arm\?/)
    expect(FORMULA).toMatch(/macos-arm64\.zip/)
    expect(FORMULA).toMatch(/macos-x64\.zip/)
    expect(FORMULA).toMatch(/on_linux do/)
    expect(FORMULA).toMatch(/linux-x64\.AppImage/)
    const shaLines = FORMULA.match(/sha256 "[a-f0-9]{64}"/g) ?? []
    expect(shaLines).toHaveLength(3)
  })

  it('installs the app on macOS and the AppImage into bin on Linux', () => {
    expect(FORMULA).toMatch(/app\.install "Another Markdown Editor\.app"/)
    expect(FORMULA).toMatch(/bin\.install "Another Markdown Editor-0\.1\.0-linux-x64\.AppImage"/)
  })
})

describe('README installation contract (README.md)', () => {
  it('has a clearly headed installation section (FR-011, US3 s1)', () => {
    expect(README).toMatch(/^## Installation$/m)
  })

  it('documents the exact Homebrew command (FR-011, US3 s2)', () => {
    expect(README).toContain('brew install yetanotherchris/tap/another-markdown-editor')
  })

  it('documents the exact Scoop bucket + install commands (FR-011, US3 s3)', () => {
    expect(README).toContain(
      'scoop bucket add another-markdown-editor https://github.com/yetanotherchris/another-markdown-editor'
    )
    expect(README).toContain('scoop install another-markdown-editor')
  })
})
