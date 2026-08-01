import { useCallback } from 'react'
import { Tree as ArboristTree, NodeApi } from 'react-arborist'
import type { TreeNode } from '../state/workspace'
import { useElementSize } from '../hooks/useElementSize'
import './Tree.css'

interface TreeProps {
  data: TreeNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onActivate: (id: string) => void
  onToggle: (id: string, isOpen: boolean) => void
}

interface TreeNodeProps {
  node: NodeApi<TreeNode>
  style: React.CSSProperties
  dragHandle?: (el: HTMLDivElement | null) => void
}

function TreeNode({ node, style, dragHandle }: TreeNodeProps) {
  const isDir = node.data.kind === 'directory'
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-node ${node.isSelected ? 'selected' : ''} ${node.isLeaf ? 'leaf' : ''}`}
      onClick={() => node.select()}
      onDoubleClick={() => node.activate()}
      role="treeitem"
      aria-expanded={isDir ? node.isOpen : undefined}
      aria-selected={node.isSelected}
    >
      {isDir && (
        <span
          className="tree-node-toggle"
          role="button"
          aria-label={node.isOpen ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation()
            node.toggle()
          }}
        >
          {node.isOpen ? '\u25BE' : '\u25B8'}
        </span>
      )}
      <span className="tree-node-icon">{isDir ? (node.isOpen ? '📂' : '📁') : '📄'}</span>
      <span className="tree-node-name">{node.data.name}</span>
    </div>
  )
}

export default function Tree({ data, selectedId, onSelect, onActivate, onToggle }: TreeProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()

  const handleSelect = useCallback((nodes: NodeApi<TreeNode>[]) => {
    const first = nodes[0]
    onSelect(first?.id ?? null)
  }, [onSelect])

  const handleActivate = useCallback((node: NodeApi<TreeNode>) => {
    onActivate(node.id)
  }, [onActivate])

  const handleToggle = useCallback((id: string) => {
    const node = findNodeById(data, id)
    if (!node) return
    onToggle(id, node.loadState === 'loaded')
  }, [data, onToggle])

  return (
    <div ref={containerRef} className="tree-container">
      {data.length === 0 ? (
        <div className="tree-empty">No markdown files in this folder</div>
      ) : (
        <ArboristTree
          data={data}
          width={size.width}
          height={size.height}
          rowHeight={28}
          selection={selectedId ?? undefined}
          onSelect={handleSelect}
          onActivate={handleActivate}
          onToggle={handleToggle}
          disableDrag={true}
          disableDrop={true}
          openByDefault={false}
        >
          {TreeNode}
        </ArboristTree>
      )}
    </div>
  )
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}
