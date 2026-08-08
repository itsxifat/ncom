import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getProject } from '@/server/services/projectService'
import { listPages } from '@/server/services/pageService'
import { env } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PageActionsMenu } from '@/components/dashboard/page-actions-menu'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { organization } = await getActiveOrganization()

  let project
  try {
    project = await getProject(organization.id, projectId)
  } catch {
    notFound()
  }

  const pages = await listPages(organization.id, projectId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {project.subdomain}.ncom.app
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href={`/projects/${project.id}/theme`} />}
            nativeButton={false}
          >
            Theme
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/projects/${project.id}/media`} />}
            nativeButton={false}
          >
            Media
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/projects/${project.id}/settings`} />}
            nativeButton={false}
          >
            Settings
          </Button>
          <Button
            render={<Link href={`/projects/${project.id}/pages/new`} />}
            nativeButton={false}
          >
            New page
          </Button>
        </div>
      </div>

      {pages.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No pages yet.{' '}
            <Link
              href={`/projects/${project.id}/pages/new`}
              className="text-foreground underline"
            >
              Create your first page
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{page.title}</span>
                  {page.isHome && <Badge variant="secondary">Home</Badge>}
                  <Badge variant="outline">{page.status}</Badge>
                </div>
                <p className="text-muted-foreground truncate text-sm">
                  /{page.isHome ? '' : page.slug}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {page.status === 'PUBLISHED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={`http://${project.subdomain}.${env.ROOT_DOMAIN}${page.isHome ? '' : `/${page.slug}`}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    View live
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      href={`/projects/${project.id}/pages/${page.id}/preview`}
                    />
                  }
                  nativeButton={false}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  render={
                    <Link
                      href={`/projects/${project.id}/pages/${page.id}/edit`}
                    />
                  }
                  nativeButton={false}
                >
                  Edit
                </Button>
                <PageActionsMenu
                  projectId={project.id}
                  pageId={page.id}
                  status={page.status}
                  previewToken={page.previewToken}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
