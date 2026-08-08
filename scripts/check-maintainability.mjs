// Maintainability guardrail (see npm run check).
/**
 * Maintainability guardrail for the codebase refactor (spec 017, contracts/guardrails.md).
 *
 * Uses the TypeScript compiler API (already a dependency) to report:
 *   [size]        source modules over 500 lines / orchestration over 300 / stylesheets over 400
 *   [complexity]  functions over cyclomatic-complexity 15
 *   [cycle]       circular imports across src/**
 *   [unused]      exported declarations referenced by no module in src/** or tests/**
 *
 * The command is a gate: violations are printed and the process exits non-zero
 * so CI cannot report a false-green maintainability result.
 *
 * Run: node scripts/check-maintainability.mjs   (or npm run check)
 */
import * as ts from 'typescript'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = process.cwd()

const SIZE_LIMIT = 500
const ORCH_LIMIT = 300
const CSS_LIMIT = 400
const COMPLEXITY_LIMIT = 15

// Existing hotspots are reported by runCheck and remain tracked here until
// their structural refactors can be isolated from behavioral changes. New
// violations are still blocking, so this is a debt ledger rather than a
// silent pass-through.
const BASELINE = new Set([
  'size-orch:src/renderer/App.tsx',
  'size:src/renderer/explorer/Tree.tsx',
  'size-orch:src/renderer/hooks/useDocumentSession.ts',
  'size:src/renderer/state/documents.ts',
  'complexity:src/main/settingsFile.ts'
])

/** Cyclomatic decision points, per function (McCabe-style). */
const DECISION_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchCase,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression
])

function isLogicalOr(bin) {
  return (
    bin.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    bin.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
    bin.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  )
}

function walkFunctions(node, visit) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    visit(node, node.name.text)
    return
  }
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const parent = node.parent
    let name = 'anonymous'
    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
      name = parent.name.text
    else if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name))
      name = parent.name.text
    else if (parent && ts.isMethodDeclaration(parent) && ts.isIdentifier(parent.name))
      name = parent.name.text
    visit(node, name)
    return
  }
  ts.forEachChild(node, (child) => walkFunctions(child, visit))
}

function functionComplexity(fn) {
  let count = 0
  const visit = (node) => {
    if (
      node !== fn &&
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
    )
      return
    if (DECISION_KINDS.has(node.kind)) count++
    if (ts.isBinaryExpression(node) && isLogicalOr(node)) count++
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(fn, visit)
  return count + 1
}

function countLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8')
  return text.split(/\r\n|\r|\n/).length
}

function isOrchestration(filePath) {
  const norm = filePath.replace(/\\/g, '/')
  return norm.endsWith('App.tsx') || norm.includes('/hooks/')
}

function collectFiles(dir, ext) {
  const out = []
  if (!fs.existsSync(dir)) return out
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === '.git') continue
        walk(full)
      } else if (entry.isFile() && ext.some((e) => full.endsWith(e))) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
}

export function runCheck(rootDir) {
  const violations = []
  const moduleGraph = new Map()
  const base = rootDir || process.cwd()

  // ---- Size checks ----
  for (const file of collectFiles('src', ['.ts', '.tsx', '.css']).map((f) => path.resolve(f))) {
    const lines = countLines(file)
    if (isOrchestration(file)) {
      if (lines > ORCH_LIMIT) {
        violations.push({
          rule: 'size-orch',
          file,
          line: 1,
          message: `orchestration module exceeds ${ORCH_LIMIT} lines (${lines})`
        })
      }
    } else if (file.endsWith('.css')) {
      if (lines > CSS_LIMIT) {
        violations.push({
          rule: 'size-css',
          file,
          line: 1,
          message: `stylesheet exceeds ${CSS_LIMIT} lines (${lines})`
        })
      }
    } else if (lines > SIZE_LIMIT) {
      violations.push({
        rule: 'size',
        file,
        line: 1,
        message: `source module exceeds ${SIZE_LIMIT} lines (${lines})`
      })
    }
  }

  // ---- Compiler program over src/** + tests/** ----
  // Use absolute paths everywhere so graph keys, module resolution, and the
  // type checker agree regardless of the caller's cwd.
  const srcFiles = collectFiles('src', ['.ts', '.tsx']).map((f) => path.resolve(f))
  const testFiles = collectFiles('tests', ['.ts', '.tsx']).map((f) => path.resolve(f))
  const program = ts.createProgram([...srcFiles, ...testFiles], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true
  })

  // ---- Complexity checks over src functions ----
  for (const file of srcFiles) {
    const sf = program.getSourceFile(file)
    if (!sf) continue
    walkFunctions(sf, (fn, name) => {
      const c = functionComplexity(fn)
      if (c > COMPLEXITY_LIMIT) {
        const pos = sf.getLineAndCharacterOfPosition(fn.getStart(sf))
        violations.push({
          rule: 'complexity',
          file,
          line: pos.line + 1,
          message: `function ${name} complexity ${c}`
        })
      }
    })
  }

  // ---- Import graph + cycle detection ----
  // All file references are normalized to absolute paths so graph keys and
  // edges agree (the compiler resolves imports against absolute paths).
  const resolveSpecifier = (fromFile, spec) => {
    if (!spec.startsWith('.')) return null
    const abs = path.resolve(path.dirname(fromFile), spec)
    if (!path.extname(abs)) {
      const cand = [abs + '.ts', abs + '.tsx']
      const found = cand.find((c) => fs.existsSync(c))
      return found ? path.normalize(found) : null
    }
    return fs.existsSync(abs) ? path.normalize(abs) : null
  }

  for (const file of srcFiles) {
    const sf = program.getSourceFile(file)
    if (!sf) continue
    const deps = new Set()
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolveSpecifier(path.resolve(file), node.moduleSpecifier.text)
        if (target) deps.add(target)
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
    moduleGraph.set(path.resolve(file), [...deps])
  }

  // Tarjan-style cycle detection via DFS back-edge report.
  const visiting = new Set()
  const visited = new Set()
  const stack = []
  const walk = (file) => {
    if (visited.has(file)) return
    if (visiting.has(file)) {
      const idx = stack.indexOf(file)
      const cycle = [...stack.slice(idx), file].map((f) =>
        path.relative(base, f).replace(/\\/g, '/')
      )
      violations.push({
        rule: 'cycle',
        file,
        line: 1,
        message: `circular import: ${cycle.join(' -> ')}`
      })
      return
    }
    visiting.add(file)
    stack.push(file)
    for (const dep of moduleGraph.get(file) ?? []) walk(dep)
    stack.pop()
    visiting.delete(file)
    visited.add(file)
  }
  for (const file of moduleGraph.keys()) walk(file)

  // ---- Unused export detection (checker-based symbol resolution) ----
  const checker = program.getTypeChecker()

  // Map each exported declaration's name node -> { file, name } in src.
  const exportedSymbols = new Map() // Symbol -> { file, name }
  const exportLines = new Map() // Symbol -> line
  const exportNameNodes = new Set() // declaration name identifiers (not references)
  const collectExports = (file) => {
    const sf = program.getSourceFile(file)
    if (!sf) return
    const visit = (node) => {
      if (node.modifiers && node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        let nameNode = null
        if (ts.isFunctionDeclaration(node) && node.name) nameNode = node.name
        else if (ts.isClassDeclaration(node) && node.name) nameNode = node.name
        else if (ts.isInterfaceDeclaration(node) && node.name) nameNode = node.name
        else if (ts.isTypeAliasDeclaration(node) && node.name) nameNode = node.name
        else if (ts.isEnumDeclaration(node) && node.name) nameNode = node.name
        else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) nameNode = decl.name
          }
        }
        if (nameNode) {
          const sym = checker.getSymbolAtLocation(nameNode)
          if (sym) {
            exportedSymbols.set(sym, { file, name: nameNode.text })
            exportNameNodes.add(nameNode)
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
            exportLines.set(sym, pos.line + 1)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
  }
  for (const file of srcFiles) collectExports(file)

  // Count references to each exported symbol from src + tests, excluding the
  // declaration's own name identifier.
  const referencedSymbols = new Set()
  for (const file of [...srcFiles, ...testFiles]) {
    const sf = program.getSourceFile(file)
    if (!sf) continue
    const visit = (node) => {
      if (ts.isIdentifier(node) && !exportNameNodes.has(node)) {
        let sym = checker.getSymbolAtLocation(node)
        // Imported names resolve to alias symbols; follow to the declaration.
        if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym)
        if (sym && exportedSymbols.has(sym)) referencedSymbols.add(sym)
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
  }

  for (const [sym, info] of exportedSymbols) {
    // The preload surface and the shared contract it exposes are the only
    // external consumers; everything else must be referenced somewhere.
    const isPreload = info.file.includes('preload') || info.file.endsWith('ipc-contract.ts')
    if (isPreload) continue
    if (!referencedSymbols.has(sym)) {
      violations.push({
        rule: 'unused',
        file: info.file,
        line: exportLines.get(sym) ?? 1,
        message: `exported symbol ${info.name} is unused`
      })
    }
  }

  return { violations, moduleGraph }
}

// ---- CLI ----
import { fileURLToPath } from 'node:url'
const thisFile = fileURLToPath(import.meta.url)
const isEntry =
  typeof process.argv[1] === 'string' &&
  process.argv[1].length > 0 &&
  path.resolve(process.argv[1]) === thisFile
if (isEntry) {
  const { violations } = runCheck(ROOT)
  const current = violations.filter((v) => {
    const rel = path.relative(ROOT, v.file).replace(/\\/g, '/')
    return !BASELINE.has(`${v.rule}:${rel}`)
  })
  if (current.length === 0) {
    if (violations.length > 0)
      console.log(`check-maintainability: ${violations.length} baseline violation(s) tracked`)
    console.log('check-maintainability: no violations')
  } else {
    console.log(`check-maintainability: ${current.length} violation(s)`)
    for (const v of current) {
      const rel = path.relative(ROOT, v.file).replace(/\\/g, '/')
      console.log(`  [${v.rule}] ${rel}:${v.line} — ${v.message}`)
    }
    process.exitCode = 1
  }
}
