import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const videoContentSchema = z.object({
  heading: z.string().max(150).optional(),
  videoUrl: z.string().min(1),
  posterUrl: z.string().optional(),
})

export type VideoContent = z.infer<typeof videoContentSchema>

export const videoDefaultContent: VideoContent = {
  heading: 'See it in action',
  videoUrl: '',
}

function toEmbedUrl(url: string): string | null {
  const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`

  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`

  return null
}

function VideoRenderer({
  content,
  config,
}: SectionRendererProps<VideoContent>) {
  if (!content.videoUrl) return null

  const embedUrl = toEmbedUrl(content.videoUrl)

  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {content.heading && (
          <PageHeading className="max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div
          style={{ borderRadius: 'var(--page-radius)' }}
          className="mt-8 aspect-video w-full overflow-hidden bg-black"
        >
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              src={content.videoUrl}
              poster={content.posterUrl}
              controls
              className="h-full w-full"
            />
          )}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const videoSection: SectionDefinition<VideoContent> = {
  key: 'video',
  name: 'Video',
  category: 'Content',
  schema: videoContentSchema,
  defaultContent: videoDefaultContent,
  Renderer: VideoRenderer,
}
