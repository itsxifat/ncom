import { PageHeader } from '@/components/app/page-header'
import { PlanForm } from '../PlanForm'

export const metadata = { title: 'New plan' }

export default function NewPlanPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="New plan"
        description="Everything here is editable later — nothing is baked into a release."
        backHref="/admin/plans"
        backLabel="Plans"
      />
      <PlanForm plan={null} />
    </div>
  )
}
