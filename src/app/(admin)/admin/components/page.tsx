import { listComponentDefinitions } from '@/server/services/adminService'
import { Card, CardContent } from '@/components/ui/card'
import { ComponentRow } from './ComponentRow'

export default async function AdminComponentsPage() {
  const components = await listComponentDefinitions()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Components
        </h1>
        <p className="text-muted-foreground mt-1">
          Curate which section types are available in the builder palette. New
          types are added by developers in code, not here.
        </p>
      </div>

      {components.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No component definitions seeded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
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
        </div>
      )}
    </div>
  )
}
