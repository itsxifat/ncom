import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listCollections } from '@/server/services/collectionService'
import { listPickerProducts } from '@/server/services/productService'
import { prisma } from '@/server/db/client'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
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

  const [catalog, members] = await Promise.all([
    listPickerProducts(organization.id),
    prisma.collectionProduct.findMany({
      where: { collectionId },
      select: { productId: true },
      orderBy: { position: 'asc' },
    }),
  ])

  return (
    <PageShell>
      <PageHeader
        backHref={`/collections`}
        backLabel="Collections"
        title={collection.title}
      />
      <CollectionForm
        products={catalog.products}
        currencyCode={catalog.currencyCode}
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
    </PageShell>
  )
}
