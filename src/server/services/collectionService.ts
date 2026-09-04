import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import type { Prisma } from '@/generated/prisma/client'
import type {
  CollectionRule,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@/lib/validation/collection'

/**
 * Collections, manual and automated.
 *
 * A MANUAL collection stores its membership as CollectionProduct rows. An
 * AUTOMATED one stores rules and resolves membership at query time — its
 * CollectionProduct rows are not written and must not be read, because they
 * would go stale the moment a product changed.
 */

async function uniqueCollectionHandle(
  organizationId: string,
  base: string,
  excludeId?: string
): Promise<string> {
  const baseHandle = slugify(base) || 'collection'

  const existing = await prisma.collection.findFirst({
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
    const collision = await prisma.collection.findFirst({
      where: { organizationId, handle: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique collection handle')
}

/**
 * Compiles one rule into a Prisma predicate over Product.
 *
 * The field and operator have already been constrained to closed enums by
 * lib/validation/collection.ts, so this switch is total and no tenant-supplied
 * string ever reaches a column name. Only the *value* is user input, and it
 * only ever lands in a parameterised position.
 */
function ruleToWhere(rule: CollectionRule): Prisma.ProductWhereInput {
  const { field, operator, value } = rule

  // Tags are an array column, so the string operators mean something different
  // on them — `equals` is membership, `contains` is a substring match against
  // any element (which Postgres arrays cannot express directly, so it degrades
  // to membership).
  if (field === 'tag') {
    return operator === 'notEquals' || operator === 'notContains'
      ? { NOT: { tags: { has: value } } }
      : { tags: { has: value } }
  }

  // Numeric rules apply to the product's variants, not the product itself.
  if (
    field === 'price' ||
    field === 'weightGrams' ||
    field === 'inventoryQuantity'
  ) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return {}

    if (field === 'inventoryQuantity') {
      const comparison =
        operator === 'greaterThan'
          ? { gt: numeric }
          : operator === 'lessThan'
            ? { lt: numeric }
            : { equals: numeric }
      return {
        variants: {
          some: { inventoryLevels: { some: { available: comparison } } },
        },
      }
    }

    const column = field === 'price' ? 'priceCents' : 'weightGrams'
    const comparison =
      operator === 'greaterThan'
        ? { gt: numeric }
        : operator === 'lessThan'
          ? { lt: numeric }
          : { equals: numeric }

    return { variants: { some: { [column]: comparison } } }
  }

  const column: 'title' | 'productType' | 'vendor' = field
  const insensitive = { mode: 'insensitive' as const }

  switch (operator) {
    case 'equals':
      return { [column]: { equals: value, ...insensitive } }
    case 'notEquals':
      return { NOT: { [column]: { equals: value, ...insensitive } } }
    case 'contains':
      return { [column]: { contains: value, ...insensitive } }
    case 'notContains':
      return { NOT: { [column]: { contains: value, ...insensitive } } }
    case 'startsWith':
      return { [column]: { startsWith: value, ...insensitive } }
    case 'endsWith':
      return { [column]: { endsWith: value, ...insensitive } }
    default:
      return {}
  }
}

function rulesToWhere(
  rules: CollectionRule[],
  match: 'ALL' | 'ANY'
): Prisma.ProductWhereInput {
  const clauses = rules
    .map(ruleToWhere)
    .filter((clause) => Object.keys(clause).length > 0)
  if (clauses.length === 0) return {}
  return match === 'ALL' ? { AND: clauses } : { OR: clauses }
}

function sortToOrderBy(
  sortOrder: string
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sortOrder) {
    case 'TITLE_ASC':
      return [{ title: 'asc' }]
    case 'TITLE_DESC':
      return [{ title: 'desc' }]
    case 'CREATED_ASC':
      return [{ createdAt: 'asc' }]
    case 'CREATED_DESC':
      return [{ createdAt: 'desc' }]
    // Price and best-selling need an aggregate over variants and order lines
    // that Prisma cannot express in orderBy; they fall back to newest-first
    // rather than silently returning an arbitrary order.
    default:
      return [{ createdAt: 'desc' }]
  }
}

export async function listCollections(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.collection.findMany({
    where: { organizationId },
    include: { _count: { select: { products: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Resolves a collection's products, honouring whether it is manual or
 * automated. This is what both the admin preview and the storefront read.
 */
export async function getCollectionProducts(
  organizationId: string,
  collectionId: string,
  options: { take?: number; skip?: number; publishedOnly?: boolean } = {}
) {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, organizationId },
  })
  if (!collection) throw new Error('Collection not found')

  const statusFilter = options.publishedOnly
    ? { status: 'ACTIVE' as const }
    : {}

  if (collection.type === 'MANUAL') {
    const links = await prisma.collectionProduct.findMany({
      where: { collectionId, product: statusFilter },
      include: {
        product: {
          include: {
            variants: { orderBy: { position: 'asc' } },
            images: {
              orderBy: { position: 'asc' },
              include: {
                media: { select: { url: true, width: true, height: true } },
              },
            },
            options: { orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { position: 'asc' },
      take: options.take ?? 50,
      skip: options.skip ?? 0,
    })

    return links.map((link) => link.product)
  }

  const rules = (collection.rules ?? []) as CollectionRule[]

  return prisma.product.findMany({
    where: {
      organizationId,
      ...statusFilter,
      ...rulesToWhere(rules, collection.rulesMatch),
    },
    include: {
      variants: { orderBy: { position: 'asc' } },
      images: {
        orderBy: { position: 'asc' },
        include: {
          media: { select: { url: true, width: true, height: true } },
        },
      },
      options: { orderBy: { position: 'asc' } },
    },
    orderBy: sortToOrderBy(collection.sortOrder),
    take: options.take ?? 50,
    skip: options.skip ?? 0,
  })
}

export async function createCollection(
  organizationId: string,
  input: CreateCollectionInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const handle = await uniqueCollectionHandle(
    organizationId,
    input.handle ?? input.title
  )

  return prisma.collection.create({
    data: {
      organizationId,
      title: input.title,
      handle,
      description: input.description ?? null,
      imageMediaId: input.imageMediaId ?? null,
      type: input.type,
      rules: input.rules as unknown as Prisma.InputJsonValue,
      rulesMatch: input.rulesMatch,
      sortOrder: input.sortOrder,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      publishedAt: new Date(),
    },
  })
}

export async function updateCollection(
  organizationId: string,
  collectionId: string,
  input: UpdateCollectionInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.collection.findFirst({
    where: { id: collectionId, organizationId },
    select: { id: true },
  })
  if (!existing) throw new Error('Collection not found')

  const handle = input.handle
    ? await uniqueCollectionHandle(organizationId, input.handle, collectionId)
    : undefined

  return prisma.collection.update({
    where: { id: collectionId },
    data: {
      title: input.title,
      handle,
      description: input.description,
      imageMediaId: input.imageMediaId,
      rules: input.rules
        ? (input.rules as unknown as Prisma.InputJsonValue)
        : undefined,
      rulesMatch: input.rulesMatch,
      sortOrder: input.sortOrder,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    },
  })
}

/** Replaces a manual collection's membership and ordering in one write. */
export async function setCollectionProducts(
  organizationId: string,
  collectionId: string,
  productIds: string[]
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, organizationId },
    select: { id: true, type: true },
  })
  if (!collection) throw new Error('Collection not found')
  if (collection.type === 'AUTOMATED') {
    throw new Error(
      'This collection is automated — its products come from its rules'
    )
  }

  // Confirm every id belongs to this store before writing any of them.
  const owned = await prisma.product.count({
    where: { id: { in: productIds }, organizationId },
  })
  if (owned !== productIds.length) {
    throw new Error('One or more products do not belong to this store')
  }

  return prisma.$transaction(async (tx) => {
    await tx.collectionProduct.deleteMany({ where: { collectionId } })
    if (productIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: productIds.map((productId, index) => ({
          collectionId,
          productId,
          position: index,
        })),
      })
    }
  })
}

export async function deleteCollection(
  organizationId: string,
  collectionId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, organizationId },
    select: { id: true },
  })
  if (!collection) throw new Error('Collection not found')

  await prisma.collection.delete({ where: { id: collectionId } })
}
