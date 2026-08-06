import type { DocumentState } from '../state/documents'
import { markdownSame } from '../state/documents'
import { joinFrontmatter } from './frontmatter'

/** The instance-pool markdown accessor, injected so these functions stay pure
 *  and testable without the Crepe runtime (FR-003, US2). */
export type MarkdownAccessor = (documentId: string) => string | null

/** The editor's live serialization for a document, or null when it has no
 *  mounted editor (evicted). A source-view document's text lives in the store,
 *  not the editor, so this returns null there too. */
export function getLiveContent(doc: DocumentState, getMarkdown: MarkdownAccessor): string | null {
  if (doc.editorState !== 'live') return null
  return getMarkdown(doc.id)
}

/** Live-dirty check (spec 002): `doc.dirty` is authoritative when set; a
 *  source-view document's signal is entirely `doc.dirty` (its editor would
 *  serialize the stale pre-source-edit content, so the editor comparison below
 *  would be meaningless). Otherwise compare the live serialization against the
 *  editor's OWN baseline — Crepe normalizes markdown, so a pristine normalizing
 *  file must not count as dirty; only drift from the baseline means the user
 *  typed (raw-bytes policy). */
export function isDirtyLive(doc: DocumentState, getMarkdown: MarkdownAccessor): boolean {
  if (doc.dirty) return true
  if (doc.view === 'source') return false
  const live = getLiveContent(doc, getMarkdown)
  if (live === null) return false
  return !markdownSame(live, doc.editorBaseline)
}

/** The bytes a save writes (spec 002 save model): source view writes the raw
 *  full text the user sees; a formatted document that is clean in the live-dirty
 *  sense writes the stored raw body bytes (a no-edit open/save stays
 *  byte-identical); only a document with real drift writes the Crepe
 *  serialization so the edits are kept. Spec 021: the stored frontmatter block
 *  is recombined at the top of every save (FR-005), and with no frontmatter the
 *  body is returned unchanged so no empty block is ever added (FR-010). */
export function getContentToSave(doc: DocumentState, getMarkdown: MarkdownAccessor): string {
  if (doc.view === 'source') return joinFrontmatter(doc.frontmatter, doc.content)
  if (isDirtyLive(doc, getMarkdown)) return joinFrontmatter(doc.frontmatter, getMarkdown(doc.id) ?? doc.content)
  return joinFrontmatter(doc.frontmatter, doc.content)
}

/** Per-document flush decision (raw-bytes policy): a source-view document's
 *  text lives in the store, so flushing its editor would clobber raw edits;
 *  the serialization of a PRISTINE document must never replace the stored disk
 *  bytes (Crepe's output can differ beyond the tolerated trailing newline and
 *  would mark an unedited file dirty); and the live text is only adopted when
 *  the reducer already knows the document was edited (`dirty` set by the
 *  debounced emission). */
export function shouldFlushLive(doc: DocumentState, getMarkdown: MarkdownAccessor): boolean {
  if (doc.view === 'source') return false
  const live = getLiveContent(doc, getMarkdown)
  if (live === null || markdownSame(live, doc.content)) return false
  if (!doc.dirty) return false
  return true
}
