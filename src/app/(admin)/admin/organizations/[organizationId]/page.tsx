import { notFound } from 'next/navigation'
import { getOrganizationDetail } from '@/server/services/adminService'
import { env } from '@/lib/env'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app/page-header'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowText,
} from '@/components/app/list-panel'

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params

  let organization
  try {
    organization = await getOrganizationDetail(organizationId)
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref="/admin/organizations"
        backLabel="Organizations"
        eyebrow={organization.slug}
        title={organization.name}
        description={`${organization.memberships.length} ${organization.memberships.length === 1 ? 'member' : 'members'} · ${organization.stores.length} ${organization.stores.length === 1 ? 'store' : 'stores'}.`}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ListPanel>
          <ListPanelHeader>
            <h2 className="font-display text-base font-semibold tracking-tight">
              Members
            </h2>
            <Badge variant="secondary">{organization.memberships.length}</Badge>
          </ListPanelHeader>
          {organization.memberships.map((membership) => (
            <ListRow key={membership.id}>
              <ListRowText
                title={membership.user.name ?? membership.user.email}
                meta={membership.user.email}
              />
              <Badge variant="outline">{membership.role}</Badge>
            </ListRow>
          ))}
        </ListPanel>

        <ListPanel>
          <ListPanelHeader>
            <h2 className="font-display text-base font-semibold tracking-tight">
              Stores
            </h2>
            <Badge variant="secondary">{organization.stores.length}</Badge>
          </ListPanelHeader>
          {organization.stores.length === 0 && (
            <p className="text-muted-foreground px-5 py-6 text-sm sm:px-6">
              This organization hasn&apos;t created a store yet.
            </p>
          )}
          {organization.stores.map((store) => (
            <ListRow key={store.id}>
              <ListRowText
                title={store.name}
                meta={`${store.subdomain}.${env.ROOT_DOMAIN}`}
              />
              <p className="text-muted-foreground shrink-0 text-sm">
                {store._count.pages}{' '}
                {store._count.pages === 1 ? 'page' : 'pages'}
              </p>
            </ListRow>
          ))}
        </ListPanel>
      </div>
    </div>
  )
}
