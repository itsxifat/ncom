'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { El } from '../elements'
import { ALIGN, FillImg, HERO_HEIGHTS } from '../blockPrimitives'
import { safeHref } from '../sanitizeHtml'
import { storeHref } from '../storefront'
import { cn } from '@/lib/utils'
import type { SliderContent } from './index'
import { useStoreText } from '@/modules/storefront/StoreTextProvider'

/**
 * What a slide with no picture is painted with.
 *
 * A template arrives with no photos in it, and a slider of flat white boxes
 * tells a merchant nothing about how their home page will look. These are
 * quiet washes of their own brand colour, varied per slide so two in a row do
 * not read as one, and they disappear the moment a real picture goes in.
 */
const FALLBACKS = [
  'bg-[linear-gradient(120deg,color-mix(in_oklab,var(--page-primary)_24%,var(--page-background))_0%,color-mix(in_oklab,var(--page-primary)_6%,var(--page-background))_70%)]',
  'bg-[linear-gradient(150deg,color-mix(in_oklab,var(--page-text)_7%,var(--page-background))_0%,color-mix(in_oklab,var(--page-primary)_20%,var(--page-background))_100%)]',
  'bg-[radial-gradient(circle_at_78%_22%,color-mix(in_oklab,var(--page-primary)_30%,var(--page-background))_0%,var(--page-background)_62%)]',
]

const JUSTIFY: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

/** How far a finger has to travel before a swipe counts as one. */
const SWIPE_PX = 40

const CONTROL =
  'flex items-center justify-center rounded-full transition hover:scale-105'

/**
 * The moving half of the slider: which slide is showing, and what changes it.
 *
 * Autoplay stops while a shopper is pointing at the slider or has tabbed into
 * it — a banner that slides away mid-read is the most common complaint about
 * sliders — and never runs for someone who has asked their device for less
 * motion, or inside the builder, where a merchant styling slide one should not
 * have it whisked away.
 */
export function SliderClient({
  content,
  linkBase,
  editing,
  extras,
}: {
  content: SliderContent
  linkBase: string
  editing: boolean
  /** The merchant's added elements, rendered by the server half. */
  extras: React.ReactNode
}) {
  const { slides } = content
  const { words } = useStoreText()
  const count = slides.length
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)

  // A slide deleted in the inspector can leave the index pointing past the
  // end; clamping here rather than in an effect means there is never a frame
  // with nothing showing.
  const current = count > 0 ? Math.min(active, count - 1) : 0

  const go = useCallback(
    (index: number) => {
      if (count === 0) return
      setActive(((index % count) + count) % count)
    },
    [count]
  )

  useEffect(() => {
    if (editing || paused || count < 2 || content.autoplaySeconds <= 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Rebuilt whenever the slide changes, so a shopper who taps an arrow gets
    // a full interval on the slide they chose rather than the remainder of the
    // last one's.
    const timer = window.setInterval(() => {
      // A background tab keeps its timers; nobody is watching it slide.
      if (document.hidden) return
      go(current + 1)
    }, content.autoplaySeconds * 1000)
    return () => window.clearInterval(timer)
  }, [editing, paused, count, content.autoplaySeconds, current, go])

  /**
   * In the builder the canvas takes every click as a selection and stops it
   * there, so an arrow's `onClick` never runs. Moving on pointer-down as well
   * lets the merchant flip to slide three with the arrow they just selected —
   * one press both picks the arrow to style and shows the next slide. On the
   * live site only `onClick` is bound, which is what a keyboard presses.
   */
  const press = (index: number) => ({
    onClick: () => go(index),
    onPointerDown: editing ? () => go(index) : undefined,
  })

  if (count === 0) {
    return (
      <El
        as="div"
        part="frame"
        className={cn('relative grid place-items-center', HERO_HEIGHTS.small)}
      >
        <div className="m-6 max-w-md rounded-2xl border-2 border-dashed border-[color-mix(in_oklab,currentColor_25%,transparent)] px-6 py-10 text-center">
          <p className="text-[13px] font-semibold opacity-75">
            Image slider — no slides yet
          </p>
          <p className="mt-1 text-[12px] opacity-55">
            Add a slide in the Content tab. This block is hidden on your live
            site until it has one.
          </p>
        </div>
      </El>
    )
  }

  const showingPicture = Boolean(
    slides[current]?.image || slides[current]?.mobileImage
  )

  return (
    <El
      as="div"
      part="frame"
      role="region"
      aria-roledescription="carousel"
      aria-label={words.featured}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event: React.FocusEvent<HTMLDivElement>) => {
        // Moving focus from one arrow to the next is still "in the slider".
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setPaused(false)
      }}
      onTouchStart={(event: React.TouchEvent<HTMLDivElement>) => {
        touchStartX.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event: React.TouchEvent<HTMLDivElement>) => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start === null) return
        const moved = (event.changedTouches[0]?.clientX ?? start) - start
        if (Math.abs(moved) > SWIPE_PX) go(current + (moved < 0 ? 1 : -1))
      }}
      // Every slide sits in the same grid cell, so the frame is as tall as the
      // tallest slide's words need and never crops a long headline on a phone.
      // The darkening is a custom property read by each overlay's class rather
      // than an inline opacity, so the overlay's own design controls still win.
      className={cn(
        'relative grid overflow-hidden',
        HERO_HEIGHTS[content.height] ?? HERO_HEIGHTS.large
      )}
      style={
        {
          '--slider-overlay': Math.min(80, Math.max(0, content.overlay)) / 100,
        } as React.CSSProperties
      }
    >
      {slides.map((slide, index) => {
        const isActive = index === current
        const hasPicture = Boolean(slide.image || slide.mobileImage)
        const href =
          safeHref(storeHref(slide.buttonHref, linkBase)) ??
          storeHref('/', linkBase)

        return (
          <El
            key={index}
            as="div"
            part="slide"
            index={index}
            aria-roledescription="slide"
            aria-label={words.slideOf(index + 1, count)}
            // Slides waiting their turn are out of the tab order and hidden
            // from screen readers, so a keyboard never lands on a button the
            // shopper cannot see.
            inert={!isActive}
            className={cn(
              'relative flex flex-col justify-center transition-opacity duration-700 ease-out [grid-area:1/1] motion-reduce:transition-none',
              isActive ? 'z-[1] opacity-100' : 'pointer-events-none opacity-0',
              !hasPicture && FALLBACKS[index % FALLBACKS.length]
            )}
          >
            {hasPicture && (
              <>
                {slide.mobileImage && (
                  <div className="absolute inset-0 sm:hidden">
                    <FillImg
                      part="mobileImage"
                      index={index}
                      src={slide.mobileImage}
                      loading={index === 0 ? 'eager' : 'lazy'}
                    />
                  </div>
                )}
                <div
                  className={cn(
                    'absolute inset-0',
                    slide.mobileImage && 'hidden sm:block'
                  )}
                >
                  <FillImg
                    part="image"
                    index={index}
                    src={slide.image || slide.mobileImage}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />
                </div>
                <El
                  as="div"
                  part="overlay"
                  index={index}
                  className="absolute inset-0 bg-black [opacity:var(--slider-overlay)]"
                />
              </>
            )}

            <div
              className={cn(
                'relative mx-auto flex w-full max-w-[var(--page-container-width)] px-4 py-14 sm:px-6 sm:py-20',
                JUSTIFY[slide.align] ?? JUSTIFY.left
              )}
            >
              <El
                as="div"
                part="content"
                index={index}
                className={cn(
                  'flex max-w-2xl flex-col gap-4',
                  ALIGN[slide.align] ?? ALIGN.left
                )}
              >
                {slide.eyebrow && (
                  <El
                    as="p"
                    part="eyebrow"
                    index={index}
                    html={slide.eyebrow}
                    className={cn(
                      'text-xs font-semibold tracking-[0.2em] uppercase',
                      hasPicture
                        ? 'text-white/85'
                        : 'text-[var(--page-primary)]'
                    )}
                  />
                )}
                {slide.title && (
                  <El
                    // The first slide is the page's headline; the rest are
                    // headings under it.
                    as={index === 0 ? 'h1' : 'h2'}
                    part="title"
                    index={index}
                    html={slide.title}
                    className={cn(
                      '[font-family:var(--page-font-heading)] text-3xl leading-[1.08] [font-weight:var(--page-heading-weight)] tracking-tight text-balance sm:text-5xl lg:text-6xl',
                      hasPicture ? 'text-white' : 'text-[var(--page-text)]'
                    )}
                  />
                )}
                {slide.subtitle && (
                  <El
                    as="p"
                    part="subtitle"
                    index={index}
                    html={slide.subtitle}
                    className={cn(
                      'max-w-xl text-base sm:text-lg',
                      hasPicture
                        ? 'text-white/85'
                        : 'text-[color-mix(in_oklab,var(--page-text)_72%,transparent)]'
                    )}
                  />
                )}
                {slide.buttonText && (
                  <El
                    as="a"
                    part="button"
                    index={index}
                    href={href}
                    html={slide.buttonText}
                    className="mt-2 inline-flex min-h-12 w-fit items-center justify-center rounded-[var(--page-radius)] bg-[var(--page-primary)] px-8 text-sm font-semibold text-[var(--page-on-primary)] shadow-sm transition hover:opacity-90 active:scale-[0.99]"
                  />
                )}
              </El>
            </div>
          </El>
        )
      })}

      {/* Arrows from tablet up only: on a phone they sit on the headline,
          and a thumb swipes — the dots say there is more. */}
      {content.showArrows && count > 1 && (
        <>
          <El
            as="button"
            part="arrow"
            index={0}
            type="button"
            aria-label={words.previousSlide}
            {...press(current - 1)}
            className={cn(
              CONTROL,
              'absolute top-1/2 left-3 z-[2] hidden size-11 -translate-y-1/2 bg-[color-mix(in_oklab,var(--page-background)_85%,transparent)] text-[var(--page-text)] shadow-md sm:left-5 sm:flex'
            )}
          >
            <ChevronLeft className="size-5" />
          </El>
          <El
            as="button"
            part="arrow"
            index={1}
            type="button"
            aria-label={words.nextSlide}
            {...press(current + 1)}
            className={cn(
              CONTROL,
              'absolute top-1/2 right-3 z-[2] hidden size-11 -translate-y-1/2 bg-[color-mix(in_oklab,var(--page-background)_85%,transparent)] text-[var(--page-text)] shadow-md sm:right-5 sm:flex'
            )}
          >
            <ChevronRight className="size-5" />
          </El>
        </>
      )}

      {content.showDots && count > 1 && (
        <El
          as="div"
          part="dots"
          className="absolute bottom-5 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-2"
        >
          {slides.map((_, index) => (
            <El
              key={index}
              as="button"
              part="dot"
              index={index}
              type="button"
              aria-label={words.goToSlide(index + 1)}
              aria-current={index === current}
              {...press(index)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                index === current ? 'w-6' : 'w-2 opacity-55',
                // Dots sit on whatever the current slide is painted with:
                // white over a photo, the text colour over a brand wash.
                showingPicture ? 'bg-white' : 'bg-[var(--page-text)]'
              )}
            />
          ))}
        </El>
      )}

      {/* Added elements share the frame with the slides rather than taking a
          row of their own below them, and only they take clicks — the layer
          itself must not cover the current slide's button. */}
      <div className="pointer-events-none relative z-[2] flex flex-wrap items-end justify-center gap-3 self-end px-4 pb-14 [grid-area:1/1] empty:hidden [&>*]:pointer-events-auto">
        {extras}
      </div>
    </El>
  )
}
