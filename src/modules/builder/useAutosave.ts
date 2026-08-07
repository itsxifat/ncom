'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from './store'
import { saveSectionsAction } from '@/app/(dashboard)/projects/[projectId]/pages/[pageId]/edit/actions'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 800

export function useAutosave(projectId: string, pageId: string) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  const sections = useBuilderStore((s) => s.sections)
  const isDirty = useBuilderStore((s) => s.isDirty)
  const markClean = useBuilderStore((s) => s.markClean)
  const reconcileIds = useBuilderStore((s) => s.reconcileIds)

  async function save() {
    if (savingRef.current) return
    savingRef.current = true
    setStatus('saving')

    try {
      const currentSections = useBuilderStore.getState().sections
      const { idMapping } = await saveSectionsAction(
        projectId,
        pageId,
        currentSections.map((s) => ({
          id: s.id,
          componentDefinitionId: s.componentDefinitionId,
          order: s.order,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
        }))
      )
      if (Object.keys(idMapping).length > 0) {
        reconcileIds(idMapping)
      }
      markClean()
      setStatus('saved')
    } catch (error) {
      console.error('Autosave failed:', error)
      setStatus('error')
    } finally {
      savingRef.current = false
    }
  }

  useEffect(() => {
    if (!isDirty) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(save, DEBOUNCE_MS)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, isDirty])

  return { status, saveNow: save }
}
