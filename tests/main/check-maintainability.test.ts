import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const { runCheck } = await import('../../scripts/check-maintainability.mjs')

let cwd: string
let tmpRoot: string

beforeEach(() => {
  cwd = process.cwd()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-guardrail-'))
  process.chdir(tmpRoot)
  fs.mkdirSync(path.join(tmpRoot, 'src'))
  fs.mkdirSync(path.join(tmpRoot, 'src', 'orchestration'))
  fs.mkdirSync(path.join(tmpRoot, 'tests'))
})

afterEach(() => {
  process.chdir(cwd)
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function write(rel: string, content: string): void {
  const full = path.join(tmpRoot, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

/** A file with exactly `lines` physical lines. */
function nLineFile(rel: string, lines: number): void {
  write(rel, '# fixture\n' + '// line\n'.repeat(Math.max(0, lines - 2)))
}

describe('check-maintainability guardrail', () => {
  it('reports a source module over the 500-line limit', () => {
    nLineFile('src/big.ts', 520)
    const { violations } = runCheck(tmpRoot)
    const size = violations.find((v) => v.rule === 'size' && v.file.endsWith('big.ts'))
    expect(size).toBeTruthy()
    expect(size!.message).toContain('exceeds 500 lines')
  })

  it('reports an orchestration module over the 300-line limit', () => {
    nLineFile('src/orchestration/App.tsx', 340)
    const { violations } = runCheck(tmpRoot)
    const size = violations.find((v) => v.rule === 'size-orch' && v.file.endsWith('App.tsx'))
    expect(size).toBeTruthy()
    expect(size!.message).toContain('exceeds 300 lines')
  })

  it('reports a stylesheet over the 400-line limit', () => {
    nLineFile('src/orchestration/app.css', 450)
    const { violations } = runCheck(tmpRoot)
    const size = violations.find((v) => v.rule === 'size-css' && v.file.endsWith('app.css'))
    expect(size).toBeTruthy()
    expect(size!.message).toContain('exceeds 400 lines')
  })

  it('reports a function over the cyclomatic-complexity limit', () => {
    const body = Array.from({ length: 17 }, (_, i) => `    if (a[${i}]) return ${i}`).join('\n')
    write('src/complex.ts', `export function many(x: number): number {\n  const a = [1, 2, 3]\n${body}\n  return -1\n}\n`)
    const { violations } = runCheck(tmpRoot)
    const c = violations.find((v) => v.rule === 'complexity' && v.file.endsWith('complex.ts'))
    expect(c).toBeTruthy()
    expect(c!.message).toContain('complexity')
  })

  it('reports a two-module circular import', () => {
    write('src/a.ts', `import { b } from './b'\nexport const a = b\n`)
    write('src/b.ts', `import { a } from './a'\nexport const b = a\n`)
    const { violations } = runCheck(tmpRoot)
    const cycle = violations.find((v) => v.rule === 'cycle')
    expect(cycle).toBeTruthy()
    expect(cycle!.message).toContain('circular import')
  })

  it('reports an exported symbol imported by nothing', () => {
    write('src/unused.ts', `export function orphan(): number { return 1 }\n`)
    const { violations } = runCheck(tmpRoot)
    const unused = violations.find((v) => v.rule === 'unused' && v.message.includes('orphan'))
    expect(unused).toBeTruthy()
  })

  it('does not report a symbol consumed by another module', () => {
    write('src/used.ts', `export function live(): number { return 1 }\n`)
    write('src/consumer.ts', `import { live } from './used'\nexport const n = live()\n`)
    const { violations } = runCheck(tmpRoot)
    const unused = violations.find((v) => v.rule === 'unused' && v.message.includes('live'))
    expect(unused).toBeFalsy()
  })

  it('reports no violations on a clean fixture tree', () => {
    write('src/ok.ts', `export function fine(): number { return 1 }\n`)
    write('src/user.ts', `import { fine } from './ok'\nconst v = fine()\n`)
    write('tests/ok.test.ts', `import { describe, it, expect } from 'vitest'\ndescribe('x', () => { it('y', () => expect(1).toBe(1)) })\n`)
    const { violations } = runCheck(tmpRoot)
    const nonSize = violations.filter((v) => v.rule === 'complexity' || v.rule === 'cycle' || v.rule === 'unused')
    expect(nonSize).toHaveLength(0)
  })
})
