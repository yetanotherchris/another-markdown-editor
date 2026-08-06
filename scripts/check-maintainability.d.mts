/** Type declaration for scripts/check-maintainability.mjs (spec 017 guardrail). */
export interface Violation {
  rule: 'size' | 'size-orch' | 'size-css' | 'complexity' | 'cycle' | 'unused'
  file: string
  line: number
  message: string
}

export interface CheckResult {
  violations: Violation[]
  moduleGraph: Map<string, string[]>
}

export function runCheck(rootDir: string): CheckResult
