import { useCallback } from 'react'
import type { DocumentState } from '../state/documents'
import { useElementSize } from '../hooks/useElementSize'
import { shortenPath } from './shortenPath'

interface StatusFooterProps {
  activeDoc: DocumentState | null
  workspaceRoot: string | null
  workspaceName: string | null
}

/** Character-width estimate for Inter at the footer's ~12px size. */
const CHAR_WIDTH_PX = 8

/**
 * Spec 003, US3 (FR-008…012): the persistent status footer. The left region
 * identifies the active document; the right region shows the workspace's full
 * path, shortened with a '…' prefix (final folder kept whole) when the
 * available width cannot fit it.
 *
 * The width is measured on the workspace REGION container (flex: 1, min-width:
 * 0), not the text span — measuring the span itself is a feedback loop, since
 * the shortened text shrinks the span it was sized against (research R4).
 */
export default function StatusFooter({ activeDoc, workspaceRoot, workspaceName }: StatusFooterProps) {
  const [regionRef, regionSize] = useElementSize<HTMLDivElement>()
  const hasWorkspace = workspaceName !== null

  const displayPath = useCallback(() => {
    if (!workspaceRoot) return 'No folder open'
    const maxChars = Math.max(
      (workspaceRoot.split(/[/\\]/).pop() ?? workspaceRoot).length + 3,
      Math.floor(regionSize.width / CHAR_WIDTH_PX)
    )
    return shortenPath(workspaceRoot, maxChars)
  }, [workspaceRoot, regionSize.width])

  return (
    <footer className="app-footer" data-testid="status-footer">
      <span className="document-title" data-testid="footer-document">
        {activeDoc
          ? `${activeDoc.title}${activeDoc.dirty ? ' \u2022' : ''}`
          : <span className="footer-placeholder">No document open</span>}
      </span>
      <div ref={regionRef} className="footer-workspace-region">
        <span
          className="footer-workspace"
          data-testid="footer-workspace"
          title={workspaceRoot ?? undefined}
        >
          {hasWorkspace ? displayPath() : <span className="footer-placeholder">No folder open</span>}
        </span>
      </div>
    </footer>
  )
}
