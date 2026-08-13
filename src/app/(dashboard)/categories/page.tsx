import Link from 'next/link'
import { FolderTree, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listCategoryTree } from '@/server/services/categoryService'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { CategoryTree } from '@/components/store/category-tree'

export default async function CategoriesPage() {
  const { organization } = await getActiveOrganization()
  const tree = await listCategoryTree(organization.id)

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="No categories yet"
        description="Categories are how shoppers browse: Womenswear → Dresses → Maxi. Build the tree once and every storefront, filter and menu follows it."
        action={
          <Button render={<Link href="/categories/new" />} nativeButton={false}>
            <Plus />
            New category
          </Button>
        }
      />
    )
  }

  const totals = countTree(tree)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {totals.categories} categories · {totals.subcategories} subcategories
          · {totals.children} child categories
        </p>
        <Button render={<Link href="/categories/new" />} nativeButton={false}>
          <Plus />
          New category
        </Button>
      </div>

      <CategoryTree nodes={tree} />
    </div>
  )
}

function countTree(
  nodes: { level: number; children: { level: number; children: unknown[] }[] }[]
) {
  let categories = 0
  let subcategories = 0
  let children = 0

  const walk = (list: { level: number; children: unknown[] }[]) => {
    for (const node of list) {
      if (node.level === 0) categories++
      else if (node.level === 1) subcategories++
      else children++
      walk(node.children as { level: number; children: unknown[] }[])
    }
  }
  walk(nodes)

  return { categories, subcategories, children }
}
