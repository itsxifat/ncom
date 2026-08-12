import { Blocks } from 'lucide-react'
import { listComponentDefinitions } from '@/server/services/adminService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { ListPanel } from '@/components/app/list-panel'
import { ComponentRow } from './ComponentRow'

export default async function AdminComponentsPage() {
  const components = await listComponentDefinitions()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Content"
        title="Components"
        description="Choose which section types appear in the builder palette. New types are added in code, not here."
      />

      {components.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="No component definitions"
          description="Run the seed to populate the builder palette."
        />
      ) : (
        <ListPanel>
          {components.map((component) => (
            <ComponentRow
              key={component.id}
              id={component.id}
              componentKey={component.key}
              name={component.name}
              category={component.category}
              isActive={component.isActive}
            />
          ))}
        </ListPanel>
      )}
    </div>
  )
}
