import { describe, it, expect } from 'vitest'
import { documentsReducer, openFile, createEmpty, getActiveDocument } from '../../src/renderer/state/documents'
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

    it(`captures baseline correctly: ${fixture}`, () => {
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

      // Simulate Crepe emitting its first normalized markdown
      const normalized = content.replace(/\r\n/g, '\n')
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: normalized }
      })

      // Now capture it as the baseline
      const s3 = documentsReducer(s2, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: normalized }
      })

      expect(s3.documents[0].baseline).toBe(normalized)
      expect(s3.documents[0].content).toBe(normalized)
      expect(s3.documents[0].dirty).toBe(false)
    })

    it(`save without edit should not dirty: ${fixture}`, () => {
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

      // Crepe normalises on load
      const normalized = content.replace(/\r\n/g, '\n')
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: normalized }
      })

      // Capture Crepe's first emission as baseline
      const s3 = documentsReducer(s2, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: normalized }
      })

      // User makes no edits; content matches baseline
      expect(s3.documents[0].dirty).toBe(false)
    })
  }
})
