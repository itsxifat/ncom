import { notFound } from 'next/navigation'
import { getPlanForAdmin } from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { PlanForm } from '../PlanForm'

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>
}) {
  const { planId } = await params
  const plan = await getPlanForAdmin(planId)
  if (!plan) notFound()

  return (
    <PageShell>
      <PageHeader
        eyebrow="Monetization"
        title={plan.name}
        description="Edits take effect on the next request for every workspace on this plan."
        backHref="/admin/plans"
        backLabel="Plans"
      />
      <PlanForm plan={plan} />
    </PageShell>
  )
}
