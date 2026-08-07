import { notFound } from 'next/navigation'
import { getPageForRawPreview } from '@/server/services/pageService'
import { PageRenderer } from '@/modules/sections/PageRenderer'

export default async function PreviewRenderPage({
  params,
}: {
  params: Promise<{ pageId: string }>
}) {
  const { pageId } = await params

  let page
  try {
    page = await getPageForRawPreview(pageId)
  } catch {
    notFound()
  }

  if (!page.project.theme) {
    notFound()
  }

  return <PageRenderer theme={page.project.theme} sections={page.sections} />
}
