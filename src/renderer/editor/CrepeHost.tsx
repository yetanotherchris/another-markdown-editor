import { useEffect, useRef } from 'react'
import type { Crepe } from '@milkdown/crepe'

interface CrepeHostProps {
  defaultValue: string
  onMarkdownUpdated: (markdown: string) => void
  onReady: (editor: Crepe) => void
}

export default function CrepeHost({ defaultValue, onMarkdownUpdated, onReady }: CrepeHostProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Crepe | null>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      const { Crepe: CrepeClass } = await import('@milkdown/crepe')
      const crepe = new CrepeClass({
        root: containerRef.current!,
        defaultValue
      })

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (mounted) {
            onMarkdownUpdated(markdown)
          }
        })
      })

      await crepe.create()
      if (mounted) {
        editorRef.current = crepe
        onReady(crepe)
      }
    }

    init()

    return () => {
      mounted = false
      editorRef.current?.destroy()
      editorRef.current = null
    }
  }, [])

  return <div ref={containerRef} />
}
