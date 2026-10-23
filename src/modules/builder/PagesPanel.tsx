'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Home,
  LayoutGrid,
  Loader2,
  Package,
  Plus,
} from 'lucide-react'
import { PAGE_STARTERS } from '../templates/page-starters'
import { textIn } from '../templates/localize'
import { useBuilderLanguage } from './BlockLibrary'
import { pagePath, useBuilderSite, type BuilderPage } from './SiteContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Every page of the store, one click from the builder.
 *
 * A store is several pages and a merchant editing it should move between them
 * the way they move between pages of the shop itself — not by leaving the
 * builder for a list and coming back. The store's own designs (how a product
 * page looks, how a category looks) are listed separately with a line saying
 * what they are for, because "Product page" is not a page anyone visits by
 * name and a merchant who does not know that will go looking for it.
 */
export function PagesPanel({
  createPage,
}: {
  createPage: (
    starterKey: string,
    title: string
  ) => Promise<{ ok: true; pageId: string } | { ok: false; error: string }>
}) {
  const site = useBuilderSite()
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  if (!site) return null

  const open = (page: BuilderPage) =>
    router.push(`/stores/${site.storeId}/pages/${page.id}/edit`)

  const own = site.pages.filter((page) => page.role === 'STANDARD')
  const designs = site.pages.filter(
    (page) => page.role === 'PRODUCT' || page.role === 'CATALOG'
  )

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1">
        <p className="text-muted-foreground px-1 text-xs font-semibold">
          Your pages
        </p>
        {own.map((page) => (
          <PageRow
            key={page.id}
            active={page.id === site.pageId}
            icon={page.isHome ? Home : FileText}
            title={page.isHome ? 'Home' : page.title}
            meta={pagePath(page)}
            hidden={page.status === 'UNPUBLISHED'}
            onClick={() => open(page)}
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => setAdding(true)}
        >
          <Plus />
          Add a page
        </Button>
      </section>

      {designs.length > 0 && (
        <section className="flex flex-col gap-1">
          <p className="text-muted-foreground px-1 text-xs font-semibold">
            Shop pages
          </p>
          <p className="text-muted-foreground px-1 pb-1 text-xs">
            Designed once, used for every product and every category.
          </p>
          {designs.map((page) => (
            <PageRow
              key={page.id}
              active={page.id === site.pageId}
              icon={page.role === 'PRODUCT' ? Package : LayoutGrid}
              title={page.role === 'PRODUCT' ? 'Product page' : 'Category page'}
              meta={
                page.role === 'PRODUCT'
                  ? 'How each product looks'
                  : 'Categories, search and all products'
              }
              onClick={() => open(page)}
            />
          ))}
        </section>
      )}

      <AddPageDialog
        open={adding}
        onClose={() => setAdding(false)}
        createPage={createPage}
        onCreated={(pageId) =>
          router.push(`/stores/${site.storeId}/pages/${pageId}/edit`)
        }
      />
    </div>
  )
}

function PageRow({
  active,
  icon: Icon,
  title,
  meta,
  hidden,
  onClick,
}: {
  active: boolean
  icon: typeof Home
  title: string
  meta: string
  hidden?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition',
        active ? 'bg-lime/40 ring-foreground/20 ring-1' : 'hover:bg-muted'
      )}
    >
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="text-muted-foreground truncate text-xs">{meta}</span>
      </span>
      {hidden && (
        <span className="text-muted-foreground text-[10px] font-semibold uppercase">
          Hidden
        </span>
      )}
    </button>
  )
}

function AddPageDialog({
  open,
  onClose,
  createPage,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  createPage: (
    starterKey: string,
    title: string
  ) => Promise<{ ok: true; pageId: string } | { ok: false; error: string }>
  onCreated: (pageId: string) => void
}) {
  const language = useBuilderLanguage()
  const [starter, setStarter] = useState(PAGE_STARTERS[1]!.key)
  const [title, setTitle] = useState(() =>
    textIn(PAGE_STARTERS[1]!.title, language)
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a page</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {PAGE_STARTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setStarter(option.key)
                setTitle(textIn(option.title, language))
              }}
              aria-pressed={starter === option.key}
              className={cn(
                'flex flex-col gap-0.5 rounded-lg p-3 text-left ring-1 transition',
                starter === option.key
                  ? 'ring-foreground ring-2'
                  : 'ring-border hover:ring-foreground/30'
              )}
            >
              <span className="text-sm font-semibold">{option.name}</span>
              <span className="text-muted-foreground text-xs">
                {option.description}
              </span>
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Page name</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button
          disabled={pending || !title.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await createPage(starter, title)
              if (result.ok) {
                onClose()
                onCreated(result.pageId)
              } else setError(result.error)
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          Add page
        </Button>
      </DialogContent>
    </Dialog>
  )
}
