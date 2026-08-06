import { moveTargetPath, wouldMoveIntoOwnDescendant } from './operations'

/**
 * Pure drag-and-drop target logic for the explorer tree (US1, suggestion 7/11),
 * extracted from Tree.tsx so it is unit-testable without react-arborist.
 *
 * A drop on empty space targets the root: arborist's internal root node has no
 * `data.kind`, which maps to the workspace root `''`.
 */
export function treeMoveTarget(id: string, targetParentId: string): string | null {
  const target = moveTargetPath(id, targetParentId)
  if (!target) return null
  if (treeWouldMoveIntoOwnDescendant(id, targetParentId)) return null
  return target
}

/** True when dropping `id` into `targetParentId` would move it into itself. */
export function treeWouldMoveIntoOwnDescendant(id: string, targetParentId: string): boolean {
  return wouldMoveIntoOwnDescendant(id, targetParentId)
}
