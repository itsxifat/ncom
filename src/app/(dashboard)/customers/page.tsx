import Link from 'next/link'
import { Users } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listCustomers } from '@/server/services/customerService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { formatMoney } from '@/lib/money'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/store/form-controls'

const PAGE_SIZE = 50

export default async function CustomersPage({
  params,
  searchParams,
}: PageProps<'/customers'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const page = Math.max(1, Number(query.page) || 1)

  const { organization } = await getActiveOrganization()
  const [settings, { items, total }] = await Promise.all([
    getOrganizationSettings(organization.id),
    listCustomers(organization.id, {
      search,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ])

  const currency = settings?.currencyCode ?? 'USD'
  const base = `/customers`

  if (total === 0 && !search) {
    return (
      <EmptyState
        icon={Users}
        title="No customers yet"
        description="Anyone who checks out — including guests — appears here with their order history."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-center gap-3">
        <Input
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search name or email"
          className="w-full sm:w-72"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={Users} title="No customers match" />
      ) : (
        <ListPanel>
          <ListPanelHeader>
            <p className="text-muted-foreground text-sm">
              {total} {total === 1 ? 'customer' : 'customers'}
            </p>
          </ListPanelHeader>

          {items.map((customer) => {
            const name = [customer.firstName, customer.lastName]
              .filter(Boolean)
              .join(' ')

            return (
              <ListRow key={customer.id}>
                <ListRowText
                  title={
                    <Link
                      href={`${base}/${customer.id}`}
                      className="hover:underline"
                    >
                      {name || customer.email}
                    </Link>
                  }
                  meta={
                    <>
                      {name ? `${customer.email} · ` : ''}
                      {customer.ordersCount}{' '}
                      {customer.ordersCount === 1 ? 'order' : 'orders'}
                    </>
                  }
                  badges={
                    customer.acceptsMarketing ? (
                      <Badge variant="secondary">Subscribed</Badge>
                    ) : undefined
                  }
                />
                <ListRowActions>
                  <Money>
                    {formatMoney(customer.totalSpentCents, currency)}
                  </Money>
                </ListRowActions>
              </ListRow>
            )
          })}
        </ListPanel>
      )}

      {total > PAGE_SIZE && (
        <nav className="flex justify-between">
          {page > 1 ? (
            <Button
              variant="outline"
              render={<Link href={`${base}?page=${page - 1}`} />}
              nativeButton={false}
            >
              Previous
            </Button>
          ) : (
            <span />
          )}
          {page * PAGE_SIZE < total && (
            <Button
              variant="outline"
              render={<Link href={`${base}?page=${page + 1}`} />}
              nativeButton={false}
            >
              Next
            </Button>
          )}
        </nav>
      )}
    </div>
  )
}
