import type { ZodType } from 'zod'
import type { ComponentType } from 'react'
import type { PageTheme, SectionConfig } from './types'

export interface SectionRendererProps<T> {
  content: T
  config?: SectionConfig
  theme: PageTheme
}

export interface SectionDefinition<T = unknown> {
  key: string
  name: string
  category: string
  schema: ZodType<T>
  defaultContent: T
  Renderer: ComponentType<SectionRendererProps<T>>
}

import { navbarSection } from './navbar'
import { heroSection } from './hero'
import { textSection } from './text'
import { imageSection } from './image'
import { imageTextSection } from './image-text'
import { featuresSection } from './features'
import { servicesSection } from './services'
import { cardsSection } from './cards'
import { testimonialsSection } from './testimonials'
import { statisticsSection } from './statistics'
import { pricingSection } from './pricing'
import { faqSection } from './faq'
import { gallerySection } from './gallery'
import { videoSection } from './video'
import { ctaSection } from './cta'
import { contactSection } from './contact'
import { newsletterSection } from './newsletter'
import { footerSection } from './footer'

export const sectionRegistry = {
  navbar: navbarSection,
  hero: heroSection,
  text: textSection,
  image: imageSection,
  'image-text': imageTextSection,
  features: featuresSection,
  services: servicesSection,
  cards: cardsSection,
  testimonials: testimonialsSection,
  statistics: statisticsSection,
  pricing: pricingSection,
  faq: faqSection,
  gallery: gallerySection,
  video: videoSection,
  cta: ctaSection,
  contact: contactSection,
  newsletter: newsletterSection,
  footer: footerSection,
  // Each entry is a SectionDefinition<T> for its own content type; a
  // uniform type parameter here is structurally impossible (Renderer's
  // prop position is contravariant), so this is the standard escape hatch
  // for a heterogeneous plugin/registry collection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<string, SectionDefinition<any>>

export type SectionKey = keyof typeof sectionRegistry

export function getSectionDefinition(
  key: string
): SectionDefinition | undefined {
  return sectionRegistry[key as SectionKey] as SectionDefinition | undefined
}
