import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface CategoryTreeNode {
  id: string
  name: string
  handle: string
  level: number
  productCount: number | null
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
 * Read-only, and a server component as a result. The tree belongs to the
 * merchant's own website — renaming, re-parenting and hiding a category all
 * happen there, and a second place to do it here would be a second answer to
 * "what is this shop's taxonomy".
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
  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-2.5 text-sm"
        style={{ paddingLeft: `${16 + node.level * 20}px` }}
      >
        {node.level > 0 && (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
        )}

        <Link
          href={`/categories/${encodeURIComponent(node.id)}`}
          className="min-w-0 flex-1 truncate font-medium hover:underline"
        >
          {node.name}
        </Link>

        <span className="text-muted-foreground truncate text-xs">
          {node.handle}
        </span>

        {node.productCount !== null && (
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {node.productCount}
          </Badge>
        )}
      </div>

      {node.children.map((child) => (
        <CategoryBranch key={child.id} node={child} />
      ))}
    </div>
  )
}
