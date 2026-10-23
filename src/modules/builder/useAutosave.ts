'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from './store'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export interface SectionSavePayload {
  id: string
  /** A block key from modules/sections/registry.ts. */
  type: string
  order: number
  content: object
  config: object
  isVisible: boolean
  /** Which page it saves to — this one, or the store's shared layout. */
  scope?: 'page' | 'layout'
}

/**
 * Which version of the page — and of the store's layout, when there is one —
 * this builder last loaded or saved. Sent with every save so the server can
 * refuse one made on top of a version that has since been replaced.
 */
export interface SaveRevisions {
  page: number
  layout: number | null
}

export type SaveResult =
  | { idMapping: Record<string, string>; revisions: SaveRevisions }
  /** The page was saved by someone else since — an AI editor, another tab. */
  | { conflict: true }

const DEBOUNCE_MS = 800

export function useAutosave(
  save: (
    sections: SectionSavePayload[],
    expected: SaveRevisions
  ) => Promise<SaveResult>,
  initialRevisions: SaveRevisions
) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  // Asked to save while a save was on its way: once it lands, save again.
  const againRef = useRef(false)
  const revisionsRef = useRef(initialRevisions)
  // Once the page has been changed elsewhere, nothing more is saved from
  // here: every save would put this tab's older copy over the newer one.
  const conflictRef = useRef(false)

  const sections = useBuilderStore((s) => s.sections)
  const isDirty = useBuilderStore((s) => s.isDirty)
  const markClean = useBuilderStore((s) => s.markClean)
  const reconcileIds = useBuilderStore((s) => s.reconcileIds)

  async function runSave() {
    if (conflictRef.current) return
    if (savingRef.current) {
      againRef.current = true
      return
    }
    // Never save a list that was not loaded from the page — see `seeded`.
    if (!useBuilderStore.getState().seeded) {
      setStatus('error')
      return
    }
    savingRef.current = true
    setStatus('saving')

    try {
      const currentSections = useBuilderStore.getState().sections
      const result = await save(
        currentSections.map((s) => ({
          id: s.id,
          type: s.type,
          order: s.order,
          content: s.content,
          config: s.config,
          isVisible: s.isVisible,
          scope: s.scope,
        })),
        revisionsRef.current
      )
      if ('conflict' in result) {
        // Left dirty on purpose: the merchant's edits are still on the canvas,
        // and they decide — by reloading — whether to give them up.
        conflictRef.current = true
        setStatus('conflict')
        return
      }
      revisionsRef.current = result.revisions
      // An edit made while the save was on its way is not in it. Marking the
      // page clean would leave that edit unsaved until the next one.
      const editedMeanwhile =
        useBuilderStore.getState().sections !== currentSections
      const { idMapping } = result
      if (Object.keys(idMapping).length > 0) {
        // Swapping a block's id for its saved one is not an edit, so it must
        // not be a step in the undo history — recorded, it made the next Undo
        // revert the id instead of the merchant's change. The mapping covers a
        // new block's temporary id, and also a block Undo brought back after
        // an earlier save had deleted it, which the server saves again under a
        // new id. The history already recorded is rewritten to the saved ids
        // too, so undoing back past a save restores blocks the server knows
        // by name.
        const temporal = useBuilderStore.temporal
        temporal.getState().pause()
        reconcileIds(idMapping)
        temporal.getState().resume()
        const remap = <T extends { sections?: { id: string }[] }>(
          states: T[]
        ) =>
          states.map((state) => ({
            ...state,
            sections: state.sections?.map((section) =>
              idMapping[section.id]
                ? { ...section, id: idMapping[section.id]! }
                : section
            ),
          }))
        temporal.setState({
          pastStates: remap(temporal.getState().pastStates),
          futureStates: remap(temporal.getState().futureStates),
        })
      }
      if (editedMeanwhile) againRef.current = true
      else markClean()
      setStatus('saved')
    } catch (error) {
      console.error('Autosave failed:', error)
      setStatus('error')
    } finally {
      savingRef.current = false
      if (againRef.current && !conflictRef.current) {
        againRef.current = false
        void runSave()
      }
    }
  }

  useEffect(() => {
    if (!isDirty || conflictRef.current) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(runSave, DEBOUNCE_MS)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, isDirty])

  /** Starts over on a page just loaded, at the versions it was loaded at. */
  function reset(revisions: SaveRevisions) {
    revisionsRef.current = revisions
    conflictRef.current = false
    againRef.current = false
    setStatus('idle')
  }

  return {
    status,
    saveNow: runSave,
    reset,
    /** Read after `saveNow`, where `status` is still the old render's. */
    isConflicted: () => conflictRef.current,
  }
}
