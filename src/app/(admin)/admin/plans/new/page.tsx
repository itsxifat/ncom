import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { PlanForm } from '../PlanForm'

export const metadata = { title: 'New plan' }

export default function NewPlanPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Monetization"
        title="New plan"
        description="Everything here is editable later — nothing is baked into a release."
        backHref="/admin/plans"
        backLabel="Plans"
      />
      <PlanForm plan={null} />
    </PageShell>
  )
}
