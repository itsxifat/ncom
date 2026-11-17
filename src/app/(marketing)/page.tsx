import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/site/home/Hero'
import { WhatYouGet } from '@/components/marketing/site/home/WhatYouGet'
import { PagesAndStores } from '@/components/marketing/site/home/PagesAndStores'
import { OrderFlow } from '@/components/marketing/site/home/OrderFlow'
import { AiBuilder } from '@/components/marketing/site/home/AiBuilder'
import { BlockEditor } from '@/components/marketing/site/home/BlockEditor'
import { Templates } from '@/components/marketing/site/home/Templates'
import { Growth } from '@/components/marketing/site/home/Growth'
import { PricingSection } from '@/components/marketing/site/home/PricingSection'
import { Faq } from '@/components/marketing/site/home/Faq'
import { FinalCta } from '@/components/marketing/site/home/FinalCta'
import { loadPackages } from '@/components/marketing/site/loadPackages'

export const metadata: Metadata = {
  title: {
    absolute: 'NCOM — Make a landing page or an online store in minutes',
  },
  description:
    'Landing pages and online stores that take cash-on-delivery orders, for sellers in Bangladesh. Fake-order check, Steadfast and Pathao booking, Bangla and English. 7-day free trial.',
  alternates: { canonical: '/' },
}

/** The NCOM homepage, from the founder-approved design on the Claude Design canvas. */
export default async function HomePage() {
  const packages = await loadPackages()
  return (
    <>
      <Hero />
      <WhatYouGet />
      <PagesAndStores />
      <OrderFlow />
      <AiBuilder />
      <BlockEditor />
      <Templates />
      <Growth />
      <PricingSection packages={packages} />
      <Faq />
      <FinalCta />
    </>
  )
}
