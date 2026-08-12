import Link from 'next/link'
import { Layers, Plus } from 'lucide-react'
import { listPlansForAdmin } from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
import { formatQuota } from '@/lib/plans'
import { PlanRowActions } from './PlanRowActions'

export const metadata = { title: 'Plans' }

export default async function AdminPlansPage() {
  const plans = await listPlansForAdmin()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="Plans"
        description="What each tier costs, allows and unlocks. Changes apply on the next request — no deploy needed."
        actions={
          <Button
            render={<Link href="/admin/plans/new" />}
            nativeButton={false}
          >
            <Plus />
            New plan
          </Button>
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No plans yet"
          description="Create a plan so new signups have something to land on."
          action={
            <Button
              render={<Link href="/admin/plans/new" />}
              nativeButton={false}
            >
              <Plus />
              New plan
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {plans.map((plan) => (
            <ListRow key={plan.id}>
              <ListRowText
                title={
                  <Link
                    href={`/admin/plans/${plan.id}`}
                    className="hover:underline"
                  >
                    {plan.name}
                  </Link>
                }
                meta={
                  <>
                    <span className="font-mono">{plan.code}</span> ·{' '}
                    {formatQuota(plan.maxPages, 'count')} pages ·{' '}
                    {formatQuota(
                      plan.storageMb === null
                        ? null
                        : plan.storageMb * 1024 * 1024,
                      'bytes'
                    )}{' '}
                    storage · {plan._count.subscriptions}{' '}
                    {plan._count.subscriptions === 1
                      ? 'workspace'
                      : 'workspaces'}
                  </>
                }
                badges={
                  <>
                    {plan.isDefault && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                    {!plan.isActive && (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                    {!plan.isPublic && plan.isActive && (
                      <Badge variant="outline">Hidden</Badge>
                    )}
                    {plan.isContactSalesOnly && (
                      <Badge variant="outline">Contact sales</Badge>
                    )}
                  </>
                }
              />
              <ListRowActions>
                <Money>
                  {plan.isContactSalesOnly
                    ? 'Custom'
                    : `${formatMoney(plan.monthlyPriceCents, plan.currencyCode)}/mo`}
                </Money>
                <PlanRowActions planId={plan.id} planName={plan.name} />
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
