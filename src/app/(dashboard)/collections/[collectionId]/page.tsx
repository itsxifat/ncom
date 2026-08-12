import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listCollections } from '@/server/services/collectionService'
import { listProducts } from '@/server/services/productService'
import { prisma } from '@/server/db/client'
import { PageHeader } from '@/components/app/page-header'
import { CollectionForm } from '@/components/store/collection-form'
import type { CollectionRule } from '@/lib/validation/collection'

export default async function EditCollectionPage({
  params,
}: PageProps<'/collections/[collectionId]'>) {
  const { collectionId } = await params
  const { organization } = await getActiveOrganization()

  // listCollections already enforces org access; the find below is scoped by
  // the ids it returned, so it cannot reach another tenant's row.
  const collections = await listCollections(organization.id)
  const collection = collections.find((entry) => entry.id === collectionId)
  if (!collection) notFound()

  const [{ items }, members] = await Promise.all([
    listProducts(organization.id, { take: 200 }),
    prisma.collectionProduct.findMany({
      where: { collectionId },
      select: { productId: true },
      orderBy: { position: 'asc' },
    }),
  ])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/collections`}
        backLabel="Collections"
        title={collection.title}
      />
      <CollectionForm
        products={items.map((product) => ({
          id: product.id,
          title: product.title,
        }))}
        initial={{
          id: collection.id,
          title: collection.title,
          handle: collection.handle,
          description: collection.description ?? '',
          type: collection.type,
          rulesMatch: collection.rulesMatch,
          sortOrder: collection.sortOrder,
          rules: ((collection.rules ?? []) as CollectionRule[]).map((rule) => ({
            field: rule.field,
            operator: rule.operator,
            value: rule.value,
          })),
          productIds: members.map((member) => member.productId),
          seoTitle: collection.seoTitle ?? '',
          seoDescription: collection.seoDescription ?? '',
        }}
      />
    </div>
  )
}
