import { describe, it, expect } from 'vitest'
import { documentsReducer, openFile } from '../../src/renderer/state/documents'
import * as fs from 'fs'
import * as path from 'path'

function createSession() {
  return { documents: [], activeId: null as string | null, untitledCounter: 0 }
}

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'roundtrip')

describe('roundtrip characterization', () => {
  const fixtures = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.md'))

  for (const fixture of fixtures) {
    it(`loads fixture: ${fixture}`, () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, fixture), 'utf-8')

      const doc = openFile({
        path: fixture,
        name: fixture,
        content,
        mtimeMs: Date.now(),
        size: Buffer.byteLength(content)
      })

      expect(doc.content).toBe(content)
      expect(doc.baseline).toBe(content)
      expect(doc.dirty).toBe(false)
      expect(doc.path).toBe(fixture)
    })

    it(`raw content/baseline untouched by editor normalization: ${fixture}`, () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, fixture), 'utf-8')
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: {
          path: fixture,
          name: fixture,
          content,
          mtimeMs: Date.now(),
          size: Buffer.byteLength(content)
        }
      })

      const docId = s1.documents[0].id

      // Crepe's first emission is its normalized serialization (raw bytes +
      // always-appended trailing newline). The raw-bytes policy (spec 002) is
      // enforced in the store: CAPTURE_BASELINE adopts nothing, so the disk
      // bytes remain authoritative and a file without a trailing newline never
      // gains one, even though the editor normalized it in-memory.
      const normalized = `${content.replace(/\r\n/g, '\n')}\n`
      const s2 = documentsReducer(s1, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: normalized }
      })

      expect(s2.documents[0].content).toBe(content)
      expect(s2.documents[0].baseline).toBe(content)
      expect(s2.documents[0].dirty).toBe(false)
    })
  }
})
