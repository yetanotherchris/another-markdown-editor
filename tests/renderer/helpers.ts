import { documentsReducer } from '../../src/renderer/state/documents'
import type { EditingSession } from '../../src/renderer/state/documents'

/** A fresh, empty session for reducer tests (US4 scenario 3). */
export function createSession(): EditingSession {
  return { documents: [], activeId: null, untitledCounter: 0 }
}

/** A session with `a.md` (alpha) and `b.md` (beta) open, `b.md` active. */
export function openTwoFiles(): EditingSession {
  const s1 = documentsReducer(createSession(), {
    type: 'OPEN_EXISTING',
    payload: { value: { path: 'a.md', name: 'a.md', content: 'alpha', mtimeMs: 1, size: 5 } }
  })
  return documentsReducer(s1, {
    type: 'OPEN_EXISTING',
    payload: { value: { path: 'b.md', name: 'b.md', content: 'beta', mtimeMs: 2, size: 4 } }
  })
}
