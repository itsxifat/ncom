import { cn } from '@/lib/utils'

/**
 * A little drawing of each block, for the library.
 *
 * A merchant choosing a block is choosing a shape on their page — "the big
 * banner", "the row of products" — and a name alone asks them to know what our
 * names mean. These are schematic on purpose: grey bars and boxes in the
 * block's real arrangement, quiet enough that twenty of them in a list read as
 * a menu rather than a collage.
 */

const bar = 'rounded-[2px] bg-foreground/20'
const ink = 'rounded-[2px] bg-foreground/55'
const box = 'rounded-[3px] bg-foreground/10'
const accent = 'rounded-[3px] bg-lime'

function Rows({ n, className }: { n: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className={cn(bar, 'h-1', i === n - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

function Cards({ n, tall = false }: { n: number; tall?: boolean }) {
  return (
    <div
      className="grid flex-1 gap-1.5"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className={cn(box, tall ? 'h-9' : 'h-6')} />
          <div className={cn(bar, 'h-1 w-3/4')} />
          <div className={cn(ink, 'h-1 w-1/3')} />
        </div>
      ))}
    </div>
  )
}

const DRAWINGS: Record<string, () => React.ReactNode> = {
  hero: () => (
    <div className="bg-foreground/10 flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[3px]">
      <div className={cn(ink, 'h-1.5 w-1/2')} />
      <div className={cn(bar, 'h-1 w-2/3')} />
      <div className={cn(accent, 'mt-0.5 h-2.5 w-1/4')} />
    </div>
  ),
  slider: () => (
    <div className="bg-foreground/10 relative flex flex-1 flex-col justify-center gap-1.5 rounded-[3px] px-3">
      <div className={cn(ink, 'h-1.5 w-1/2')} />
      <div className={cn(bar, 'h-1 w-1/3')} />
      <div className={cn(accent, 'h-2.5 w-1/5')} />
      <div className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
        <span className="bg-foreground/60 size-1 rounded-full" />
        <span className="bg-foreground/25 size-1 rounded-full" />
        <span className="bg-foreground/25 size-1 rounded-full" />
      </div>
    </div>
  ),
  promos: () => (
    <div className="grid flex-1 grid-cols-2 gap-1.5">
      <div className="bg-foreground/50 flex flex-col justify-end gap-1 rounded-[3px] p-1.5">
        <div className="bg-background/80 h-1 w-2/3 rounded-[2px]" />
      </div>
      <div className="bg-foreground/15 flex flex-col justify-end gap-1 rounded-[3px] p-1.5">
        <div className={cn(ink, 'h-1 w-2/3')} />
      </div>
    </div>
  ),
  categories: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className={cn(ink, 'h-1.5 w-1/3')} />
      <div className="flex flex-1 items-center justify-between gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="bg-foreground/12 aspect-square w-full rounded-full" />
            <div className={cn(bar, 'h-1 w-2/3')} />
          </div>
        ))}
      </div>
    </div>
  ),
  products: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className={cn(ink, 'h-1.5 w-1/3')} />
      <Cards n={4} tall />
    </div>
  ),
  relatedproducts: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className={cn(ink, 'h-1.5 w-2/5')} />
      <Cards n={4} />
    </div>
  ),
  productdetails: () => (
    <div className="grid flex-1 grid-cols-2 gap-2">
      <div className={box} />
      <div className="flex flex-col gap-1">
        <div className={cn(ink, 'h-1.5 w-3/4')} />
        <div className={cn(bar, 'h-1 w-1/3')} />
        <div className="mt-0.5 flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="border-foreground/30 h-2 w-2.5 rounded-[2px] border"
            />
          ))}
        </div>
        <div className={cn(accent, 'mt-auto h-2.5 w-full')} />
      </div>
    </div>
  ),
  productlisting: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className={cn(ink, 'h-1.5 w-1/3')} />
        <div className="border-foreground/30 h-2 w-6 rounded-[2px] border" />
      </div>
      <Cards n={4} />
    </div>
  ),
  richtext: () => (
    <div className="flex flex-1 flex-col justify-center gap-1.5 px-2">
      <div className={cn(ink, 'h-1.5 w-1/2')} />
      <Rows n={3} />
    </div>
  ),
  image: () => <div className={cn(box, 'flex-1')} />,
  gallery: () => (
    <div className="grid flex-1 grid-cols-3 gap-1">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={box} />
      ))}
    </div>
  ),
  video: () => (
    <div className="bg-foreground/15 flex flex-1 items-center justify-center rounded-[3px]">
      <div className="border-l-foreground/60 size-0 border-y-[6px] border-l-[9px] border-y-transparent" />
    </div>
  ),
  cta: () => (
    <div className="flex flex-1 items-center justify-center">
      <div className={cn(accent, 'h-4 w-1/2')} />
    </div>
  ),
  features: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className={cn(ink, 'mx-auto h-1.5 w-1/3')} />
      <div className="grid flex-1 grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border-foreground/12 flex flex-col gap-1 rounded-[3px] border p-1"
          >
            <span className="bg-lime size-1.5 rounded-full" />
            <div className={cn(bar, 'h-1 w-full')} />
          </div>
        ))}
      </div>
    </div>
  ),
  testimonials: () => (
    <div className="grid flex-1 grid-cols-2 gap-1.5">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="border-foreground/12 flex flex-col gap-1 rounded-[3px] border p-1.5"
        >
          <div className="h-1 w-1/2 rounded-[2px] bg-amber-400/80" />
          <Rows n={2} />
        </div>
      ))}
    </div>
  ),
  trust: () => (
    <div className="flex flex-1 items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-0.5">
          <span className="bg-lime size-1.5 rounded-full" />
          <div className={cn(bar, 'h-1 w-5')} />
        </div>
      ))}
    </div>
  ),
  faq: () => (
    <div className="flex flex-1 flex-col justify-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="border-foreground/15 flex h-2.5 items-center justify-between rounded-[2px] border px-1"
        >
          <div className={cn(bar, 'h-1 w-1/2')} />
          <div className="text-foreground/50 text-[6px] leading-none">+</div>
        </div>
      ))}
    </div>
  ),
  countdown: () => (
    <div className="flex flex-1 items-center justify-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-foreground/60 text-background flex size-5 items-center justify-center rounded-[3px] text-[6px] font-bold"
        >
          {['02', '15', '30'][i]}
        </div>
      ))}
    </div>
  ),
  orderform: () => (
    <div className="border-foreground/15 mx-auto flex w-2/3 flex-1 flex-col gap-1 rounded-[3px] border p-1.5">
      <div className="border-foreground/20 h-1.5 rounded-[2px] border" />
      <div className="border-foreground/20 h-1.5 rounded-[2px] border" />
      <div className={cn(accent, 'mt-auto h-2.5')} />
    </div>
  ),
  divider: () => (
    <div className="flex flex-1 items-center">
      <div className="bg-foreground/30 h-px w-full" />
    </div>
  ),
  announcement: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="bg-foreground/70 flex h-2.5 items-center justify-center rounded-[2px]">
        <div className="bg-background/80 h-0.5 w-1/3 rounded" />
      </div>
      <div className={cn(box, 'flex-1')} />
    </div>
  ),
  header: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="border-foreground/15 flex items-center justify-between rounded-[2px] border px-1.5 py-1">
        <div className={cn(ink, 'h-1.5 w-6')} />
        <div className="flex gap-1">
          <div className={cn(bar, 'h-1 w-3')} />
          <div className={cn(bar, 'h-1 w-3')} />
          <div className={cn(bar, 'h-1 w-3')} />
        </div>
        <span className="bg-foreground/40 size-1.5 rounded-full" />
      </div>
      <div className={cn(box, 'flex-1')} />
    </div>
  ),
  footer: () => (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className={cn(box, 'flex-1')} />
      <div className="bg-foreground/8 grid grid-cols-3 gap-1.5 rounded-[2px] p-1.5">
        <Rows n={2} />
        <Rows n={2} />
        <Rows n={2} />
      </div>
    </div>
  ),
}

export function BlockThumbnail({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  const draw = DRAWINGS[type] ?? DRAWINGS.richtext!
  return (
    <div
      aria-hidden
      className={cn(
        'bg-card ring-border flex aspect-[5/3] w-full flex-col overflow-hidden rounded-md p-2 ring-1',
        className
      )}
    >
      {draw()}
    </div>
  )
}
