import { notFound } from 'next/navigation'
import { getPageForRawPreview } from '@/server/services/pageService'
import { CanvasClient } from './CanvasClient'

export default async function BuilderCanvasPage({
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

  return (
    <CanvasClient
      initialTheme={page.project.theme}
      initialSections={page.sections}
    />
  )
}
