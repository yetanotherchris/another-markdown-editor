// React 19 requires IS_REACT_ACT_ENVIRONMENT for act() to flush updates in
// tests (used by tests/renderer/quit.test.tsx).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
