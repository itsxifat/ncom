import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection, youtubeId } from '../blockPrimitives'
import { El, Extras } from '../elements'

export const videoContentSchema = z.object({
  title: z.string().max(200).default(''),
  url: z.string().max(500).default(''),
  caption: z.string().max(200).default(''),
})

export type VideoContent = z.infer<typeof videoContentSchema>

export const videoDefaultContent: VideoContent = videoContentSchema.parse({})

function VideoRenderer({
  content,
  config,
}: SectionRendererProps<VideoContent>) {
  const id = youtubeId(content.url)
  if (!id) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-10">
        <BlockHeading
          part="title"
          html={content.title}
          className="mb-6 text-center"
        />
        <El
          as="div"
          part="frame"
          className="relative aspect-video overflow-hidden rounded-2xl bg-black"
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title={content.title || 'Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </El>
        {content.caption && (
          <El
            as="p"
            part="caption"
            html={content.caption}
            className="mt-3 text-center text-[12px] text-[color:var(--lp-text)]/50"
          />
        )}
        <Extras config={config} slot="content" />
      </BlockSection>
    </SectionWrapper>
  )
}

export const videoSection: SectionDefinition<VideoContent> = {
  key: 'video',
  name: 'Video',
  category: 'Content',
  description: 'An embedded YouTube video.',
  schema: videoContentSchema,
  defaultContent: videoDefaultContent,
  editorFields: [
    { type: 'richtext', name: 'title', label: 'Heading' },
    { type: 'text', name: 'url', label: 'YouTube URL' },
    { type: 'richtext', name: 'caption', label: 'Caption' },
  ],
  elements: [
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    { key: 'frame', label: 'Video frame', kind: 'embed' },
    { key: 'caption', label: 'Caption', kind: 'text', contentField: 'caption' },
  ],
  slots: [{ key: 'content', label: 'Below the video' }],
  Renderer: VideoRenderer,
}
