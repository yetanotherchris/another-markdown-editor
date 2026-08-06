import type { TreeNode } from '../state/workspace'

/**
 * Pure inline-rename decisions for the explorer tree (US1, suggestion 7/11),
 * extracted from Tree.tsx so they are unit-testable without react-arborist.
 */

/** The accessible label for the rename input: naming a new entry vs renaming
 *  an existing row. The placeholder flow names a brand-new entry. */
export function treeRenameLabel(node: Pick<TreeNode, 'name' | 'kind'>): string {
  const isPlaceholder = node.name.startsWith('new-file-') ||
    node.name.startsWith('new-folder-')
  return isPlaceholder
    ? `Name new ${node.kind === 'directory' ? 'folder' : 'file'}`
    : `Rename ${node.name}`
}
