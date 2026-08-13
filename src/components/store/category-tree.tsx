'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import {
  deleteCategoryAction,
  setCategoryActiveAction,
} from '@/app/(dashboard)/category-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CATEGORY_LEVEL_LABELS } from '@/lib/validation/category'

export interface CategoryTreeNode {
  id: string
  name: string
  handle: string
  code: string | null
  level: number
  isActive: boolean
  isFeatured: boolean
  productCount: number
  totalProductCount: number
  children: CategoryTreeNode[]
}

/**
 * The category tree, as a tree.
 *
 * Rendered nested rather than as a flat table with a "parent" column, because
 * the shape *is* the information: a merchant looking at this page is asking
 * "where does Dresses sit and what else is next to it", and a flat list makes
 * them reconstruct the answer row by row.
 *
 * Every node shows both counts — what is filed directly on it, and what is
 * under it in total — since those differing is what tells someone a parent is
 * being used as a label rather than as a shelf.
 */
export function CategoryTree({ nodes }: { nodes: CategoryTreeNode[] }) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="divide-y">
        {nodes.map((node) => (
          <CategoryBranch key={node.id} node={node} />
        ))}
      </div>
    </div>
  )
}

function CategoryBranch({ node }: { node: CategoryTreeNode }) {
  const [expanded, setExpanded] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const hasChildren = node.children.length > 0
  const canHaveChildren = node.level < CATEGORY_LEVEL_LABELS.length - 1

  function remove(mode: 'reparent' | 'cascade') {
    startTransition(async () => {
      const result = await deleteCategoryAction(node.id, mode)
      if (result?.error) {
        setError(result.error)
        return
      }
      setConfirming(false)
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setCategoryActiveAction(node.id, !node.isActive)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-3 p-4"
        // Indentation is the only thing distinguishing a subcategory from its
        // parent at a glance, so it scales with depth rather than being flat.
        style={{ paddingLeft: `${node.level * 1.75 + 1}rem` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-muted-foreground hover:text-foreground -ml-1 flex size-6 shrink-0 items-center justify-center"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )
          ) : (
            <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/categories/${node.id}`}
              className="font-medium hover:underline"
            >
              {node.name}
            </Link>
            {node.code && (
              <span className="text-muted-foreground font-mono text-xs">
                {node.code}
              </span>
            )}
            {!node.isActive && (
              <Badge variant="secondary">
                <EyeOff className="size-3" />
                Hidden
              </Badge>
            )}
            {node.isFeatured && (
              <Badge variant="lime">
                <Star className="size-3" />
                Featured
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {CATEGORY_LEVEL_LABELS[node.level]} · /{node.handle} ·{' '}
            {node.productCount} filed here
            {node.totalProductCount !== node.productCount &&
              ` · ${node.totalProductCount} including subcategories`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {canHaveChildren && (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/categories/new?parent=${node.id}`} />}
            >
              <Plus />
              Add {CATEGORY_LEVEL_LABELS[node.level + 1]?.toLowerCase()}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleActive}
            disabled={pending}
          >
            {node.isActive ? 'Hide' : 'Show'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${node.name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </div>

        {error && <p className="text-destructive w-full text-xs">{error}</p>}
      </div>

      {hasChildren && expanded && (
        <div className="divide-y border-t">
          {node.children.map((child) => (
            <CategoryBranch key={child.id} node={child} />
          ))}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{node.name}”?</DialogTitle>
            <DialogDescription>
              {node.totalProductCount > 0
                ? `${node.totalProductCount} ${node.totalProductCount === 1 ? 'product stays' : 'products stay'} in your catalogue — they simply stop being filed here.`
                : 'No products are filed here.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {hasChildren ? (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => remove('reparent')}
                >
                  Keep the {node.children.length} subcategories, move them up
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => remove('cascade')}
                >
                  Delete this and everything under it
                </Button>
              </>
            ) : (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => remove('reparent')}
              >
                Delete category
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
