import Link from 'next/link'
import { FolderTree } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listCategoryTree } from '@/server/services/categoryService'
import { describeFailure } from '@/server/catalog'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { CategoryTree } from '@/components/store/category-tree'

/**
 * The merchant's own category tree, read live.
 *
 * Optional in every sense: a connector that does not implement `/categories`
 * simply has none, and nothing in the builder depends on one existing. The
 * empty state says which of the two situations someone is looking at, because
 * "your site does not send categories" and "your site has no categories" need
 * different things done about them.
 */
export default async function CategoriesPage() {
  const { organization } = await getActiveOrganization()

  let tree: Awaited<ReturnType<typeof listCategoryTree>> = []
  let failure: string | null = null

  try {
    tree = await listCategoryTree(organization.id)
  } catch (error) {
    failure = describeFailure(error)
  }

  if (failure) {
    return (
      <EmptyState
        icon={FolderTree}
        title="Categories could not be read"
        description={failure}
        action={
          <Button
            variant="outline"
            render={<Link href="/settings/product-source" />}
            nativeButton={false}
          >
            Check the connection
          </Button>
        }
      />
    )
  }

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="No categories"
        description="Your website either has no categories or its connector does not implement the optional /categories endpoint. Either is fine — categories only affect how the dashboard filters your catalogue."
      />
    )
  }

  const totals = countTree(tree)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {totals.categories} top-level · {totals.nested} nested. Read live from
        your website — the tree is edited there.
      </p>

      <CategoryTree nodes={tree} />
    </div>
  )
}

function countTree(nodes: { level: number; children: unknown[] }[]) {
  let categories = 0
  let nested = 0

  const walk = (list: { level: number; children: unknown[] }[]) => {
    for (const node of list) {
      if (node.level === 0) categories++
      else nested++
      walk(node.children as { level: number; children: unknown[] }[])
    }
  }
  walk(nodes)

  return { categories, nested }
}
