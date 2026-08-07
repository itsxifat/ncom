'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useStore } from 'zustand'
import {
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  Check,
  Loader2,
} from 'lucide-react'
import { useBuilderStore, type BuilderSection, type Breakpoint } from './store'
import { useAutosave } from './useAutosave'
import { Canvas } from './Canvas'
import { OutlinePanel } from './OutlinePanel'
import { SectionPalette } from './SectionPalette'
import { InspectorPanel } from './InspectorPanel'
import type { PageTheme } from '../sections/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const BREAKPOINTS: {
  value: Breakpoint
  icon: typeof Monitor
  label: string
}[] = [
  { value: 'desktop', icon: Monitor, label: 'Desktop' },
  { value: 'tablet', icon: Tablet, label: 'Tablet' },
  { value: 'mobile', icon: Smartphone, label: 'Mobile' },
]

export function BuilderShell({
  projectId,
  pageId,
  pageTitle,
  theme,
  initialSections,
  componentDefinitionIds,
}: {
  projectId: string
  pageId: string
  pageTitle: string
  theme: PageTheme
  initialSections: BuilderSection[]
  componentDefinitionIds: Record<string, string>
}) {
  const setSections = useBuilderStore((s) => s.setSections)
  const setTheme = useBuilderStore((s) => s.setTheme)
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const setBreakpoint = useBuilderStore((s) => s.setBreakpoint)

  const { status } = useAutosave(projectId, pageId)

  const temporal = useBuilderStore.temporal
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0)

  useEffect(() => {
    setSections(initialSections)
    setTheme(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`/projects/${projectId}`} />}
            nativeButton={false}
          >
            ← Back
          </Button>
          <span className="truncate text-sm font-medium">{pageTitle}</span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {BREAKPOINTS.map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              type="button"
              variant={breakpoint === value ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setBreakpoint(value)}
              title={label}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canUndo}
              onClick={() => temporal.getState().undo()}
              title="Undo"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canRedo}
              onClick={() => temporal.getState().redo()}
              title="Redo"
            >
              <Redo2 className="size-4" />
            </Button>
          </div>
          <SaveStatusIndicator status={status} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[16rem_1fr_20rem] overflow-hidden">
        <aside className="flex flex-col gap-3 overflow-y-auto border-r p-3">
          <OutlinePanel />
          <SectionPalette componentDefinitionIds={componentDefinitionIds} />
        </aside>

        <main className="overflow-hidden">
          <Canvas pageId={pageId} />
        </main>

        <aside className="overflow-y-auto border-l p-3">
          <InspectorPanel />
        </aside>
      </div>
    </div>
  )
}

function SaveStatusIndicator({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground flex items-center gap-1.5 text-xs',
        status === 'error' && 'text-destructive'
      )}
    >
      {status === 'saving' && <Loader2 className="size-3.5 animate-spin" />}
      {status === 'saved' && <Check className="size-3.5" />}
      {status === 'saving' && 'Saving…'}
      {status === 'saved' && 'Saved'}
      {status === 'error' && 'Save failed'}
      {status === 'idle' && 'All changes saved'}
    </span>
  )
}
