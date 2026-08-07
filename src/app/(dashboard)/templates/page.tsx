import { prisma } from '@/server/db/client'
import { Card, CardContent } from '@/components/ui/card'

export default async function TemplatesPage() {
  const categories = await prisma.templateCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-muted-foreground mt-1">
          Browse professionally designed templates to start a new project.
        </p>
      </div>

      <Card>
        <CardContent className="text-muted-foreground py-10 text-center">
          {categories.length > 0
            ? `${categories.length} template categories are set up, but no templates have been published yet.`
            : 'No template categories yet.'}
          <br />
          The template gallery and visual builder are coming in a later step.
        </CardContent>
      </Card>
    </div>
  )
}
