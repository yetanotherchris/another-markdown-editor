import { useCallback } from 'react'
import type { DocumentState } from '../state/documents'
import { useElementSize } from '../hooks/useElementSize'
import { shortenPath } from './shortenPath'

interface StatusFooterProps {
  activeDoc: DocumentState | null
  workspaceRoot: string | null
}

/** Character-width estimate for Inter at the footer's ~12px size. */
const CHAR_WIDTH_PX = 8

/**
 * Spec 003, US3 (FR-008…012): the persistent status footer. The left region
 * identifies the active document; the right region shows the workspace's full
 * path, shortened with a '…' prefix (final folder kept whole) when the
 * available width cannot fit it.
 *
 * Both the placeholder decision and the displayed path are driven by
 * `workspaceRoot` alone: `WorkspaceInfo.path` and `name` are only ever
 * populated together (the two REPLACE dispatches), so keying the "no folder
 * open" state off the path — not the name — keeps the invariant structural.
 *
 * The width is measured on the workspace REGION container (flex: 1, min-width:
 * 0), not the text span — measuring the span itself is a feedback loop, since
 * the shortened text shrinks the span it was sized against (research R4).
 */
export default function StatusFooter({ activeDoc, workspaceRoot }: StatusFooterProps) {
  const [regionRef, regionSize] = useElementSize<HTMLDivElement>()
  const hasWorkspace = workspaceRoot !== null

  const displayPath = useCallback(() => {
    if (!workspaceRoot) return 'No folder open'
    const maxChars = Math.max(
      // The minimal shortened form is '…' + separator + final folder, so the
      // floor is exactly final.length + 2 (shortenPath's own budget).
      (workspaceRoot.split(/[/\\]/).pop() ?? workspaceRoot).length + 2,
      Math.floor(regionSize.width / CHAR_WIDTH_PX)
    )
    return shortenPath(workspaceRoot, maxChars)
  }, [workspaceRoot, regionSize.width])

  return (
    <footer className="app-footer" data-testid="status-footer">
      <span className="document-title" data-testid="footer-document">
        {activeDoc
          ? <>
              {activeDoc.title}
              {activeDoc.dirty && (
                <span className="footer-dirty" aria-label="unsaved changes" title="Unsaved changes">
                  {' \u2022'}
                </span>
              )}
            </>
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
