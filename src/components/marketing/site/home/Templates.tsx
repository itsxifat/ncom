import Image from 'next/image'
import { SectionIntro } from '../ui'

/**
 * The designs, shown as themselves: real screenshots of NCOM's templates in
 * Bangla (public/marketing/templates), drifting past in a marquee that stops
 * under the pointer.
 */

const TEMPLATES = [
  {
    key: 'landing-classic',
    name: 'Classic',
    kind: 'Landing page',
    use: 'Any single product',
  },
  {
    key: 'store-boutique',
    name: 'Boutique',
    kind: 'Online store',
    use: 'Clothing and jewellery',
  },
  {
    key: 'landing-glow',
    name: 'Glow',
    kind: 'Landing page',
    use: 'Beauty and wellness',
  },
  {
    key: 'store-volt',
    name: 'Volt',
    kind: 'Online store',
    use: 'Gadgets and electronics',
  },
  {
    key: 'landing-flash',
    name: 'Flash sale',
    kind: 'Landing page',
    use: 'Offers and drops',
  },
  {
    key: 'store-fresh',
    name: 'Fresh',
    kind: 'Online store',
    use: 'Groceries and organic',
  },
  {
    key: 'landing-launch',
    name: 'Launch',
    kind: 'Landing page',
    use: 'Gadgets and pre-orders',
  },
  {
    key: 'store-essentials',
    name: 'Essentials',
    kind: 'Online store',
    use: 'Lifestyle and gifts',
  },
]

function Card({
  template,
  hidden,
}: {
  template: (typeof TEMPLATES)[number]
  hidden?: boolean
}) {
  return (
    <figure className="tp-card" aria-hidden={hidden || undefined}>
      <div className="tp-frame">
        <Image
          src={`/marketing/templates/${template.key}.jpg`}
          alt={hidden ? '' : `${template.name} template in Bangla`}
          width={460}
          height={575}
          sizes="260px"
          className="tp-shot"
        />
        <span className="tp-kind">{template.kind}</span>
      </div>
      <figcaption>
        <b>{template.name}</b>
        <span>{template.use} · English and Bangla</span>
      </figcaption>
    </figure>
  )
}

export function Templates() {
  return (
    <section id="templates" aria-labelledby="templates-title" className="tp">
      <div className="tp-head">
        <SectionIntro
          id="templates-title"
          align="left"
          eyebrow="Templates"
          title="8 designs, each in English and Bangla, on every package."
        />
        <p className="tp-lead">
          Four landing pages and four stores, plus two blanks. Start from one,
          make it yours in the builder, and switch its language whenever you
          like.
        </p>
      </div>
      <div className="tp-rail">
        <div className="tp-track" data-marquee="">
          {TEMPLATES.map((template) => (
            <Card key={template.key} template={template} />
          ))}
          {TEMPLATES.map((template) => (
            <Card key={`${template.key}-again`} template={template} hidden />
          ))}
        </div>
      </div>
    </section>
  )
}
