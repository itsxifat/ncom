import 'server-only'
import { requireOrgAccess } from '@/server/auth/rbac'
import { listCategories, type CatalogCategory } from '@/server/catalog'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { emitWebhook } from '@/server/services/webhookService'
import {
  MAX_CATEGORY_DEPTH,
  type CategoryInput,
  type UpdateCategoryInput,
} from '@/lib/validation/category'

/**
 * The merchandising tree, from both catalogues.
 *
 * **Reading** is merged: NCOM's own Category rows and whatever the connected
 * website returns from its optional `/categories` endpoint, in one tree. A site
 * that does not implement it contributes nothing, which is not an error —
 * categories are how a shopper browses a shop, and a landing-page builder works
 * perfectly well without one.
 *
 * **Writing** is local only. NCOM's own tree keeps the rules it always had: a
 * three-level cap enforced here rather than by the database, `level`
 * denormalised from the parent chain and only ever written by this service,
 * children re-parented rather than cascaded on delete, and a refusal to move a
 * category inside its own subtree.
 *
 * Those rules are deliberately not applied to the merchant's own tree. Their
 * site may nest as deep as it likes; refusing to *display* their fourth level
 * would be this platform overruling theirs about their own taxonomy.
 */

export interface CategoryNode {
  id: string
  source: 'LOCAL' | 'REMOTE'
  name: string
  handle: string
  parentId: string | null
  level: number
  imageUrl: string | null
  productCount: number
  /** This node plus everything under it, which is what a department means. */
  totalProductCount: number
  children: CategoryNode[]

  // Local-only columns. A remote category has no equivalent of any of them —
  // its site decides what is visible, what is featured and in what order — so
  // they take the values that make it render as an ordinary, visible node.
  code: string | null
  description: string | null
  position: number
  isActive: boolean
  isFeatured: boolean
}

export async function listCategoryTree(
  organizationId: string
): Promise<CategoryNode[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  // Local rows are read here rather than through the catalogue, because this
  // screen needs columns only a local category has: whether it is hidden,
  // whether it is featured, its code, and how many products are filed on it.
  const [local, remote] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId },
      orderBy: [{ level: 'asc' }, { position: 'asc' }],
      include: {
        image: { select: { url: true } },
        _count: { select: { products: true } },
      },
    }),
    listCategories(organizationId, { source: 'REMOTE' }),
  ])

  const nodes: CategoryNode[] = [
    ...local.map((row) => ({
      id: row.id,
      source: 'LOCAL' as const,
      name: row.name,
      handle: row.handle,
      parentId: row.parentId,
      level: row.level,
      imageUrl: row.image?.url ?? null,
      productCount: row._count.products,
      totalProductCount: row._count.products,
      children: [],
      code: row.code,
      description: row.description,
      position: row.position,
      isActive: row.isActive,
      isFeatured: row.isFeatured,
    })),
    ...remote.map(toNode),
  ]

  return buildTree(nodes)
}

export interface CategoryOption {
  id: string
  label: string
  level: number
  source: 'LOCAL' | 'REMOTE'
}

/**
 * Flat "id + indented label" list for the selects.
 *
 * Carries `source` because the two trees are not interchangeable everywhere
 * they are shown. A filter may offer both — "show me everything under Shirts"
 * is a fair question whichever tree Shirts is in — but a *product* being filed
 * has to go under one of NCOM's own categories, because that is a foreign key
 * to a row in this database. Callers that write pass `localOnly`.
 */
export async function listCategoryOptions(
  organizationId: string,
  options: { localOnly?: boolean } = {}
): Promise<CategoryOption[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await listCategories(organizationId)
  const flat: CategoryOption[] = []

  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      flat.push({
        id: node.id,
        label: `${'— '.repeat(node.level)}${node.name}`,
        level: node.level,
        source: node.source,
      })
      walk(node.children)
    }
  }
  walk(buildTree(rows))

  return options.localOnly
    ? flat.filter((option) => option.source === 'LOCAL')
    : flat
}

export async function getCategory(
  organizationId: string,
  categoryId: string
): Promise<CategoryNode | null> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await listCategories(organizationId)
  return findNode(buildTree(rows), categoryId)
}

/** The path from the root down to a category, for a breadcrumb. */
export async function getCategoryPath(
  organizationId: string,
  categoryId: string
): Promise<{ id: string; name: string }[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await listCategories(organizationId)
  const byId = new Map(rows.map((row) => [row.id, row]))

  const path: { id: string; name: string }[] = []
  let current = byId.get(categoryId)
  const guard = new Set<string>()

  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    path.unshift({ id: current.id, name: current.name })
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path
}

/**
 * A category and everything beneath it.
 *
 * "Womenswear" on a filter means everything under it too, which is what a
 * merchant means by it — the products filed directly against a department are
 * usually the minority.
 */
export async function descendantIds(
  organizationId: string,
  categoryId: string
): Promise<string[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await listCategories(organizationId)
  const node = findNode(buildTree(rows), categoryId)
  if (!node) return [categoryId]

  const ids: string[] = []
  const walk = (current: CategoryNode) => {
    ids.push(current.id)
    current.children.forEach(walk)
  }
  walk(node)

  return ids
}

/** A category from the connector, as a node this screen can render. */
function toNode(row: CatalogCategory): CategoryNode {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    handle: row.handle,
    parentId: row.parentId,
    level: 0,
    imageUrl: row.imageUrl,
    productCount: row.productCount ?? 0,
    totalProductCount: row.productCount ?? 0,
    children: [],
    code: null,
    description: null,
    position: 0,
    isActive: true,
    isFeatured: false,
  }
}

function buildTree(rows: (CatalogCategory | CategoryNode)[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>(
    rows.map((row) => [
      row.id,
      'children' in row ? { ...row, children: [] } : toNode(row),
    ])
  )

  const roots: CategoryNode[] = []
  for (const node of byId.values()) {
    // A parent id naming a category the site did not send makes an orphan, and
    // an orphan is shown at the top rather than dropped: a category missing
    // from the dashboard is a merchant hunting for products they can see on
    // their own shop.
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const depth = (nodes: CategoryNode[], level: number) => {
    for (const node of nodes) {
      node.level = level
      depth(node.children, level + 1)
    }
  }
  depth(roots, 0)

  // "What is in Womenswear" means the department and everything under it. Rolled
  // up here rather than queried, because the tree is already in memory and a
  // recursive count would be one query per node.
  const rollUp = (node: CategoryNode): number => {
    node.totalProductCount =
      node.productCount +
      node.children.reduce((total, child) => total + rollUp(child), 0)
    return node.totalProductCount
  }
  roots.forEach(rollUp)

  return roots
}

function findNode(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

// ── Writing: NCOM's own tree ─────────────────────────────────────────────

/**
 * One of NCOM's own categories, in full, for the editor.
 *
 * The counterpart of getEditableProduct, and for the same reason: `getCategory`
 * answers "what is this node in the merged tree" and this answers "is this a row
 * I may edit, and what is in every column of it". Null rather than a throw for a
 * category on the merchant's website — the caller is a page choosing between a
 * form and a read-only view.
 */
export async function getEditableCategory(
  organizationId: string,
  categoryId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: CATEGORY_SELECT,
  })
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
  /** Omitted by the local writes, which are local by definition. */
  source?: 'LOCAL' | 'REMOTE'
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
    // Which catalogue it is in. Absent means local: the writes that call this
    // have just written a row here.
    source: category.source ?? 'LOCAL',
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
