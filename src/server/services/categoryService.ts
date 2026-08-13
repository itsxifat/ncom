import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { emitWebhook } from '@/server/services/webhookService'
import {
  MAX_CATEGORY_DEPTH,
  type CategoryInput,
  type UpdateCategoryInput,
} from '@/lib/validation/category'
import type { Prisma } from '@/generated/prisma/client'

/**
 * The merchandising tree.
 *
 * Three levels — category, subcategory, child category — because that is what
 * storefront navigation, breadcrumbs and faceted filters are actually built
 * around, and because an unbounded tree is easy to store and miserable to use.
 * The cap lives here rather than in the database: it is a product rule, it
 * needs to produce a message a merchant can act on, and it has to be checked
 * against the *whole subtree* being moved, which no column constraint can see.
 *
 * `level` is denormalized onto every row. It is derived from the parent chain
 * and only ever written here, so a move recomputes it for every descendant in
 * the same transaction as the move itself — a tree where a row's level
 * disagrees with its parent's is not repairable from the outside.
 *
 * Products point at exactly one category, the most specific one that applies.
 * "Everything under Womenswear" is answered by expanding the subtree at query
 * time (see `descendantIds`) rather than by writing a product into three rows,
 * so re-filing a subcategory does not require rewriting its products.
 */

export interface CategoryNode {
  id: string
  name: string
  handle: string
  code: string | null
  description: string | null
  imageMediaId: string | null
  imageUrl: string | null
  parentId: string | null
  level: number
  position: number
  isActive: boolean
  isFeatured: boolean
  seoTitle: string | null
  seoDescription: string | null
  /** Products filed directly at this node. */
  productCount: number
  /** Products at this node or anywhere beneath it. */
  totalProductCount: number
  children: CategoryNode[]
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  handle: true,
  code: true,
  description: true,
  imageMediaId: true,
  parentId: true,
  level: true,
  position: true,
  isActive: true,
  isFeatured: true,
  seoTitle: true,
  seoDescription: true,
  image: { select: { url: true } },
} satisfies Prisma.CategorySelect

/**
 * The whole tree, with product counts rolled up.
 *
 * Loaded flat and assembled in memory rather than with nested `include`s: the
 * tree is at most three deep and a few hundred rows wide, so one query beats
 * three, and the same flat list is what the reorder and move code needs anyway.
 */
export async function listCategoryTree(
  organizationId: string
): Promise<CategoryNode[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const [rows, counts] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId },
      orderBy: [{ level: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      select: CATEGORY_SELECT,
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: { organizationId, categoryId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const directCount = new Map(
    counts.map((entry) => [entry.categoryId!, entry._count._all])
  )

  const nodes = new Map<string, CategoryNode>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        handle: row.handle,
        code: row.code,
        description: row.description,
        imageMediaId: row.imageMediaId,
        imageUrl: row.image?.url ?? null,
        parentId: row.parentId,
        level: row.level,
        position: row.position,
        isActive: row.isActive,
        isFeatured: row.isFeatured,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        productCount: directCount.get(row.id) ?? 0,
        totalProductCount: 0,
        children: [],
      },
    ])
  )

  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  // Rolled up after assembly, deepest first — a parent's total is its own
  // products plus its children's totals, which is only knowable once the
  // children have theirs.
  const rollUp = (node: CategoryNode): number => {
    node.totalProductCount =
      node.productCount +
      node.children.reduce((sum, child) => sum + rollUp(child), 0)
    return node.totalProductCount
  }
  roots.forEach(rollUp)

  return roots
}

/**
 * The tree flattened for a `<select>`, with indentation baked into the label.
 *
 * A picker needs one list, and a merchant needs to see that "Dresses" is under
 * "Womenswear" rather than a top-level department with the same name as one.
 */
export async function listCategoryOptions(organizationId: string) {
  const tree = await listCategoryTree(organizationId)

  const options: {
    id: string
    label: string
    level: number
    isActive: boolean
  }[] = []

  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      options.push({
        id: node.id,
        label: `${'— '.repeat(node.level)}${node.name}`,
        level: node.level,
        isActive: node.isActive,
      })
      walk(node.children)
    }
  }
  walk(tree)

  return options
}

export async function getCategory(organizationId: string, categoryId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const category = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: CATEGORY_SELECT,
  })
  if (!category) throw new Error('Category not found')

  return category
}

/**
 * The path from the root down to a category, for breadcrumbs.
 *
 * Walks parents rather than joining, which is at most two extra reads given the
 * depth cap and avoids a recursive CTE for a three-item list.
 */
export async function getCategoryPath(
  organizationId: string,
  categoryId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const path: { id: string; name: string; handle: string }[] = []
  let current: string | null = categoryId

  for (let depth = 0; current && depth < MAX_CATEGORY_DEPTH; depth++) {
    const node: {
      id: string
      name: string
      handle: string
      parentId: string | null
    } | null = await prisma.category.findFirst({
      where: { id: current, organizationId },
      select: { id: true, name: true, handle: true, parentId: true },
    })
    if (!node) break

    path.unshift({ id: node.id, name: node.name, handle: node.handle })
    current = node.parentId
  }

  return path
}

/**
 * A category and everything beneath it.
 *
 * What "show me Womenswear" has to mean on a storefront: the department page
 * lists the dresses filed under Dresses, not just the handful filed directly
 * against Womenswear itself. Expressed as explicit levels rather than a
 * recursive query because the depth is capped at three and this runs on every
 * category page view.
 */
export async function descendantIds(
  organizationId: string,
  categoryId: string
): Promise<string[]> {
  const children = await prisma.category.findMany({
    where: { organizationId, parentId: categoryId },
    select: { id: true },
  })
  if (children.length === 0) return [categoryId]

  const grandchildren = await prisma.category.findMany({
    where: {
      organizationId,
      parentId: { in: children.map((child) => child.id) },
    },
    select: { id: true },
  })

  return [
    categoryId,
    ...children.map((child) => child.id),
    ...grandchildren.map((child) => child.id),
  ]
}

async function uniqueCategoryHandle(
  organizationId: string,
  base: string,
  excludeId?: string
): Promise<string> {
  const baseHandle = slugify(base) || 'category'

  const existing = await prisma.category.findFirst({
    where: {
      organizationId,
      handle: baseHandle,
      id: excludeId ? { not: excludeId } : undefined,
    },
    select: { id: true },
  })
  if (!existing) return baseHandle

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseHandle)
    const collision = await prisma.category.findFirst({
      where: { organizationId, handle: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique category handle')
}

/** The level a child of `parentId` would sit at, refusing to exceed the cap. */
async function levelUnder(
  organizationId: string,
  parentId: string | null | undefined
): Promise<number> {
  if (!parentId) return 0

  const parent = await prisma.category.findFirst({
    where: { id: parentId, organizationId },
    select: { level: true },
  })
  if (!parent) throw new Error('Parent category not found')

  const level = parent.level + 1
  if (level >= MAX_CATEGORY_DEPTH) {
    throw new Error(
      'Categories go three levels deep — a child category cannot have children of its own'
    )
  }

  return level
}

export async function createCategory(
  organizationId: string,
  input: CategoryInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const level = await levelUnder(organizationId, input.parentId)
  const handle = await uniqueCategoryHandle(
    organizationId,
    input.handle || input.name
  )

  // New siblings go to the end rather than to position 0, so adding one does
  // not silently reshuffle a nav bar the merchant has already arranged.
  const last = await prisma.category.findFirst({
    where: { organizationId, parentId: input.parentId ?? null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  const category = await prisma.category.create({
    data: {
      organizationId,
      parentId: input.parentId ?? null,
      name: input.name,
      handle,
      description: input.description || null,
      code: input.code ? input.code.toUpperCase() : null,
      imageMediaId: input.imageMediaId ?? null,
      level,
      position: (last?.position ?? -1) + 1,
      isActive: input.isActive ?? true,
      isFeatured: input.isFeatured ?? false,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    },
    select: CATEGORY_SELECT,
  })

  await emitWebhook(
    organizationId,
    'CATEGORY_CREATED',
    categoryPayload(category)
  )

  return category
}

export async function updateCategory(
  organizationId: string,
  categoryId: string,
  input: UpdateCategoryInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true, parentId: true, level: true },
  })
  if (!existing) throw new Error('Category not found')

  const moving =
    input.parentId !== undefined &&
    (input.parentId ?? null) !== existing.parentId

  let nextLevel = existing.level
  if (moving) {
    const parentId = input.parentId ?? null

    if (parentId === categoryId) {
      throw new Error('A category cannot be its own parent')
    }

    // Re-parenting under your own descendant detaches the whole branch from
    // the tree: it becomes a ring that no root can reach, so it vanishes from
    // every listing while still holding products.
    if (parentId) {
      const subtree = await descendantIds(organizationId, categoryId)
      if (subtree.includes(parentId)) {
        throw new Error(
          'A category cannot be moved inside one of its own children'
        )
      }
    }

    nextLevel = await levelUnder(organizationId, parentId)

    const depthBelow = await subtreeDepth(organizationId, categoryId)
    if (nextLevel + depthBelow >= MAX_CATEGORY_DEPTH) {
      throw new Error(
        'That move would push a child category past the third level. Move or remove its children first.'
      )
    }
  }

  const handle =
    input.handle !== undefined && input.handle !== ''
      ? await uniqueCategoryHandle(organizationId, input.handle, categoryId)
      : undefined

  const updated = await prisma.$transaction(async (tx) => {
    const category = await tx.category.update({
      where: { id: categoryId },
      data: {
        name: input.name,
        handle,
        description:
          input.description === undefined
            ? undefined
            : input.description || null,
        code:
          input.code === undefined
            ? undefined
            : input.code
              ? input.code.toUpperCase()
              : null,
        imageMediaId: input.imageMediaId,
        parentId: moving ? (input.parentId ?? null) : undefined,
        level: moving ? nextLevel : undefined,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        position: input.position,
        seoTitle:
          input.seoTitle === undefined ? undefined : input.seoTitle || null,
        seoDescription:
          input.seoDescription === undefined
            ? undefined
            : input.seoDescription || null,
      },
      select: CATEGORY_SELECT,
    })

    // The move changed this row's depth, so every row beneath it is now wrong
    // by the same amount. Fixed in the same transaction: a tree that is half
    // re-levelled sorts and indents incorrectly everywhere it is rendered.
    if (moving && nextLevel !== existing.level) {
      await relevelSubtree(tx, organizationId, categoryId, nextLevel)
    }

    return category
  })

  await emitWebhook(
    organizationId,
    'CATEGORY_UPDATED',
    categoryPayload(updated)
  )

  return updated
}

/** How many levels of descendants a category has (0 when it is a leaf). */
async function subtreeDepth(organizationId: string, categoryId: string) {
  const children = await prisma.category.findMany({
    where: { organizationId, parentId: categoryId },
    select: { id: true },
  })
  if (children.length === 0) return 0

  const grandchildren = await prisma.category.count({
    where: {
      organizationId,
      parentId: { in: children.map((child) => child.id) },
    },
  })

  return grandchildren > 0 ? 2 : 1
}

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0]

async function relevelSubtree(
  tx: TransactionClient,
  organizationId: string,
  rootId: string,
  rootLevel: number
) {
  const children = await tx.category.findMany({
    where: { organizationId, parentId: rootId },
    select: { id: true },
  })
  if (children.length === 0) return

  const childIds = children.map((child) => child.id)
  await tx.category.updateMany({
    where: { id: { in: childIds } },
    data: { level: rootLevel + 1 },
  })

  await tx.category.updateMany({
    where: { organizationId, parentId: { in: childIds } },
    data: { level: rootLevel + 2 },
  })
}

/**
 * Deletes a category.
 *
 * `reparent` (the default) lifts the children up to take the deleted node's
 * place; `cascade` removes the whole branch. Either way products are only
 * unfiled, never deleted — a category is a label on a product, and losing the
 * label must not lose the thing.
 */
export async function deleteCategory(
  organizationId: string,
  categoryId: string,
  mode: 'reparent' | 'cascade' = 'reparent'
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true, name: true, handle: true, parentId: true, level: true },
  })
  if (!existing) throw new Error('Category not found')

  const subtree = await descendantIds(organizationId, categoryId)

  await prisma.$transaction(async (tx) => {
    if (mode === 'cascade') {
      // Deepest first: a parent row cannot go while a child still references it.
      await tx.category.deleteMany({
        where: { organizationId, id: { in: subtree }, level: 2 },
      })
      await tx.category.deleteMany({
        where: { organizationId, id: { in: subtree }, level: 1 },
      })
      await tx.category.delete({ where: { id: categoryId } })
      return
    }

    await tx.category.updateMany({
      where: { organizationId, parentId: categoryId },
      data: { parentId: existing.parentId, level: existing.level },
    })

    // The lifted children took the deleted node's level; their own children
    // move up with them.
    const lifted = await tx.category.findMany({
      where: {
        organizationId,
        parentId: existing.parentId,
        level: existing.level,
      },
      select: { id: true },
    })
    if (lifted.length > 0) {
      await tx.category.updateMany({
        where: {
          organizationId,
          parentId: { in: lifted.map((node) => node.id) },
        },
        data: { level: existing.level + 1 },
      })
    }

    await tx.category.delete({ where: { id: categoryId } })
  })

  await emitWebhook(organizationId, 'CATEGORY_DELETED', {
    id: existing.id,
    name: existing.name,
    handle: existing.handle,
    mode,
  })
}

/**
 * Writes a new order for a set of siblings.
 *
 * Takes the full ordered list rather than a single moved id, because that is
 * what a drag-and-drop produces and because two people reordering at once
 * should not interleave into a sequence neither of them chose.
 */
export async function reorderCategories(
  organizationId: string,
  orderedIds: string[]
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  if (orderedIds.length === 0) return

  const owned = await prisma.category.findMany({
    where: { id: { in: orderedIds }, organizationId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((category) => category.id))

  await prisma.$transaction(
    orderedIds
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.category.update({
          where: { id },
          data: { position: index },
        })
      )
  )
}

/** Files a set of products under one category in a single write. */
export async function assignProductsToCategory(
  organizationId: string,
  productIds: string[],
  categoryId: string | null
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  if (productIds.length === 0) return { count: 0 }

  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true },
    })
    if (!category) throw new Error('Category not found')
  }

  const result = await prisma.product.updateMany({
    where: { id: { in: productIds }, organizationId },
    data: { categoryId },
  })

  return { count: result.count }
}

/**
 * The public shape of a category, shared by the API and the webhook payload so
 * a receiver sees the same object however it arrived.
 */
export function categoryPayload(category: {
  id: string
  name: string
  handle: string
  code: string | null
  description: string | null
  parentId: string | null
  level: number
  position: number
  isActive: boolean
  isFeatured: boolean
  imageUrl?: string | null
  image?: { url: string } | null
}) {
  return {
    id: category.id,
    name: category.name,
    handle: category.handle,
    code: category.code,
    description: category.description,
    parentId: category.parentId,
    level: category.level,
    levelName:
      ['category', 'subcategory', 'child_category'][category.level] ??
      'category',
    position: category.position,
    isActive: category.isActive,
    isFeatured: category.isFeatured,
    imageUrl: category.imageUrl ?? category.image?.url ?? null,
  }
}
