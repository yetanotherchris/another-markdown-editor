# Contracts: Codebase Refactor — guardrails

The automated maintainability check contract for US5 (FR-012, SC-001/SC-006/SC-008)
and US8 (FR-017/FR-018, SC-009/SC-010).

## Command

`npm run check` → `node scripts/check-maintainability.mjs`.

Reporting check (spec Assumption): prints violations and exits `0`; escalating
to a merge-blocking failure is a later decision. The script must be green on the
refactored codebase (SC-006: no false violations).

## Rules

| Rule | Limit | Violation report |
|------|-------|------------------|
| Source module lines (`src/**/*.{ts,tsx}`) | > 500 | `[size] file:line exceeds 500 lines (N)` |
| Orchestration module lines (App.tsx, `src/renderer/hooks/*`) | > 300 | `[size-orch] file exceeds 300 lines (N)` |
| Stylesheet lines (`src/**/*.css`) | > 400 | `[size-css] file exceeds 400 lines (N)` |
| Function cyclomatic complexity | > 15 | `[complexity] file:line (name) complexity N` |
| Circular imports (`src/**`) | any cycle | `[cycle] a -> b -> a` |
| Unused exports (`src/**` referenced by nothing in `src/` or `tests/`) | any | `[unused] file:name` |

## Cyclomatic complexity definition

Sum, per function, of: `IfStatement`, `ForStatement`, `ForOfStatement`,
`ForInStatement`, `WhileStatement`, `DoStatement`, `SwitchCase`, `CatchClause`,
`ConditionalExpression`, `BinaryExpression` with `&&`/`||`, and
`BinaryExpression` with `??` (nullish coalescing). A function's complexity is
the count of its own decision points plus 1 (the standard McCabe base), where
"own" means the function's body including nested arrow functions is counted
toward the function it lexically sits in is the simpler, per-file function
boundary; the implementation may count each named function independently —
either is acceptable as long as the report is stable and actionable.

## Scope and exceptions

- The check covers the whole `src/**` tree (FR-018: pre-existing cycles are
  resolved, not scoped away; SC-006: no false violations on the refactored
  codebase).
- Exceptions: any module/function over a limit must have its justification
  recorded in `specs/017-codebase-refactor/plan.md` (Complexity tracking or
  Decision log) or the spec's Assumptions (US5 scenario 4). The check still
  reports the violation; the record is the documentation of the exception.
- Dead-code scope: exported declarations in `src/**` are "used" when imported by
  any module in `src/**` or `tests/**`. The preload API surface
  (`src/preload/index.ts` exposing `DesktopApi`) is the only external consumer,
  and the IPC contract types consumed there count as used.

## Node API (for CI/tests)

```ts
// scripts/check-maintainability.mjs exports:
export function runCheck(rootDir: string): { violations: Violation[]; moduleGraph: Map<string, string[]> }
// Violation = { rule: 'size' | 'size-orch' | 'size-css' | 'complexity' | 'cycle' | 'unused'; file: string; line: number; message: string }
```

## Test contract

The guardrail itself is validated by a small Vitest suite
(`tests/main/check-maintainability.test.ts`) that feeds a synthetic fixture
tree (a 600-line file, a complexity-30 function, a two-module cycle, an unused
export) and asserts each rule fires, plus a clean fixture that asserts zero
violations (SC-006).
