'use client'

import { useEffect, useState } from 'react'
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
import { useAutosave, type SectionSavePayload } from './useAutosave'
import { Canvas } from './Canvas'
import { OutlinePanel } from './OutlinePanel'
import { SectionPalette } from './SectionPalette'
import { InspectorPanel } from './InspectorPanel'
import { DeliveryPanel, type DeliveryPanelProps } from './DeliveryPanel'
import {
  ProductCatalogProvider,
  type SellableVariant,
} from './ProductCatalogContext'
import type { PageTheme } from '../sections/types'
import type { PickerProduct } from '@/server/services/productService'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  entityId,
  backHref,
  title,
  theme,
  initialSections,
  products = [],
  catalog,
  delivery,
  canvasSrc,
  onSave,
}: {
  entityId: string
  backHref: string
  title: string
  theme: PageTheme
  initialSections: BuilderSection[]
  /** Sellable variants, for sections that take orders. Empty for templates,
   *  which are designed without a store behind them. */
  products?: SellableVariant[]
  /** The same catalogue with photos, prices and stock, for the product picker. */
  catalog?: { products: PickerProduct[]; currencyCode: string }
  /**
   * How this page charges for delivery, and what it rewards a big basket with.
   * Absent for the template builder, which designs a layout with no store
   * behind it — the tab is hidden entirely there rather than shown empty.
   */
  delivery?: DeliveryPanelProps
  canvasSrc: string
  onSave: (
    sections: SectionSavePayload[]
  ) => Promise<{ idMapping: Record<string, string> }>
}) {
  // The order form quotes the page's delivery rates and promotions, so the
  // canvas has to reload when they change even though no block's own content
  // did.
  const [offersRevision, setOffersRevision] = useState(0)

  const setSections = useBuilderStore((s) => s.setSections)
  const setTheme = useBuilderStore((s) => s.setTheme)
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const setBreakpoint = useBuilderStore((s) => s.setBreakpoint)

  const { status } = useAutosave(onSave)

  const temporal = useBuilderStore.temporal
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0)

  useEffect(() => {
    setSections(initialSections)
    setTheme(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId])

  return (
    <ProductCatalogProvider
      variants={products}
      products={catalog?.products}
      currencyCode={catalog?.currencyCode}
    >
      <div className="bg-background fixed inset-0 z-50 flex flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={backHref} />}
              nativeButton={false}
            >
              ← Back
            </Button>
            <span className="truncate text-sm font-medium">{title}</span>
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
            <SectionPalette />
          </aside>

          <main className="overflow-hidden">
            <Canvas canvasSrc={canvasSrc} offersRevision={offersRevision} />
          </main>

          <aside className="flex flex-col overflow-hidden border-l">
            {delivery ? (
              <Tabs
                defaultValue="section"
                className="flex min-h-0 flex-1 flex-col gap-0"
              >
                <TabsList className="mx-3 mt-3">
                  <TabsTrigger value="section">Section</TabsTrigger>
                  <TabsTrigger value="delivery">Delivery</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="section"
                  className="min-h-0 flex-1 overflow-y-auto p-3"
                >
                  <InspectorPanel />
                </TabsContent>
                <TabsContent
                  value="delivery"
                  className="min-h-0 flex-1 overflow-y-auto p-3"
                >
                  <DeliveryPanel
                    {...delivery}
                    onChange={() =>
                      setOffersRevision((revision) => revision + 1)
                    }
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex-1 overflow-y-auto p-3">
                <InspectorPanel />
              </div>
            )}
          </aside>
        </div>
      </div>
    </ProductCatalogProvider>
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
