import 'server-only'
import { requireOrgAccess } from '@/server/auth/rbac'
import { listCategories, type RemoteCategory } from '@/server/catalog'

/**
 * The merchandising tree, read from the merchant's website.
 *
 * This module used to own a three-level Category table, with a service that
 * enforced the depth cap, kept `level` denormalised, re-parented children on
 * delete and refused to move a category inside its own subtree. All of that
 * belonged to a catalogue NCOM no longer keeps.
 *
 * What is left is a read of the connector's optional `/categories` endpoint,
 * shaped into the same tree the dashboard already renders. A site that does not
 * implement it has no tree here, which is not an error: categories are how a
 * shopper browses a shop, and a landing-page builder works perfectly well
 * without one.
 *
 * The depth cap is gone with the writes. A merchant's own site may nest as deep
 * as it likes, and refusing to display their fourth level would be this
 * platform overruling theirs about their own taxonomy.
 */

export interface CategoryNode {
  id: string
  name: string
  handle: string
  parentId: string | null
  level: number
  imageUrl: string | null
  productCount: number | null
  children: CategoryNode[]
}

export async function listCategoryTree(
  organizationId: string
): Promise<CategoryNode[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await listCategories(organizationId)
  return buildTree(rows)
}

/** Flat "id + indented label" list for the filter selects. */
export async function listCategoryOptions(
  organizationId: string
): Promise<{ id: string; label: string }[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await listCategories(organizationId)
  const options: { id: string; label: string }[] = []

  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      options.push({
        id: node.id,
        label: `${'— '.repeat(node.level)}${node.name}`,
      })
      walk(node.children)
    }
  }
  walk(buildTree(rows))

  return options
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

function buildTree(rows: RemoteCategory[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        handle: row.handle,
        parentId: row.parentId,
        level: 0,
        imageUrl: row.imageUrl,
        productCount: row.productCount,
        children: [],
      },
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
