'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import createGlobe, { type Arc, type Globe, type Marker } from 'cobe'

/**
 * The hero's backdrop: the Earth from orbit, close over Bangladesh, with the
 * day's parcels arcing out from a seller in Dhaka to buyers across the country.
 *
 * A dot-map globe (cobe, WebGL, ~5 KB) zoomed in so the horizon curves behind
 * the headline and the country's cities spread out; every second or so a new
 * order arcs out and its city lights up. No glow — the atmosphere is the page
 * colour — and it only draws while on screen. Reduced motion gets the same
 * picture, still.
 */

type City = { id: string; name: string; location: [number, number] }

const DHAKA: City = { id: 'dhaka', name: 'Dhaka', location: [23.8103, 90.4125] }
const CITIES: City[] = [
  { id: 'chattogram', name: 'Chattogram', location: [22.3569, 91.7832] },
  { id: 'sylhet', name: 'Sylhet', location: [24.8949, 91.8687] },
  { id: 'rajshahi', name: 'Rajshahi', location: [24.3745, 88.6042] },
  { id: 'khulna', name: 'Khulna', location: [22.8456, 89.5403] },
  { id: 'barishal', name: 'Barishal', location: [22.701, 90.3535] },
  { id: 'rangpur', name: 'Rangpur', location: [25.7439, 89.2752] },
  { id: 'mymensingh', name: 'Mymensingh', location: [24.7471, 90.4203] },
  { id: 'cumilla', name: 'Cumilla', location: [23.4607, 91.1809] },
  { id: 'coxsbazar', name: "Cox's Bazar", location: [21.4272, 92.0058] },
  { id: 'bogura', name: 'Bogura', location: [24.8465, 89.3773] },
  { id: 'jashore', name: 'Jashore', location: [23.1664, 89.2081] },
]
/** What each new order is worth, in turn. */
const PRICES = ['৳1,550', '৳850', '৳2,200', '৳1,250', '৳850', '৳1,550']

/** The order in which buyers' cities light up. */
const ROUTE = [0, 2, 1, 4, 8, 3, 5, 9, 6, 10, 7, 0, 3, 1, 2, 8]

/** Turns the globe so a place faces the viewer (cobe's convention). */
function facing(lat: number, lng: number): [number, number] {
  return [
    Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
    (lat * Math.PI) / 180,
  ]
}

const [PHI, THETA] = facing(DHAKA.location[0], DHAKA.location[1])
/** How far the view leans north of Dhaka, and how close it is. */
const TILT = 0.18
const SCALE = 1.02

const PALETTES = {
  dark: {
    dark: 1,
    baseColor: [0.2, 0.2, 0.22] as [number, number, number],
    glowColor: [0.035, 0.035, 0.043] as [number, number, number],
    markerColor: [0.85, 0.97, 0.31] as [number, number, number],
    arcColor: [0.85, 0.97, 0.31] as [number, number, number],
    mapBrightness: 5,
    diffuse: 1.1,
  },
  light: {
    dark: 0,
    baseColor: [0.94, 0.94, 0.92] as [number, number, number],
    glowColor: [0.98, 0.98, 0.97] as [number, number, number],
    markerColor: [0.36, 0.47, 0.0] as [number, number, number],
    arcColor: [0.36, 0.47, 0.0] as [number, number, number],
    mapBrightness: 2.4,
    diffuse: 1.4,
  },
}

function frame(step: number): { markers: Marker[]; arcs: Arc[] } {
  // The last four orders: their arcs, and their cities a little brighter.
  const recent = Array.from(
    { length: 4 },
    (_, i) => ROUTE[(step - i + ROUTE.length * 8) % ROUTE.length]!
  )
  const markers: Marker[] = [
    { location: DHAKA.location, size: 0.05, id: DHAKA.id },
    ...CITIES.map((city, index) => ({
      location: city.location,
      size: index === recent[0] ? 0.04 : recent.includes(index) ? 0.028 : 0.016,
      id: city.id,
    })),
  ]
  const arcs: Arc[] = recent.map((index) => ({
    from: DHAKA.location,
    to: CITIES[index]!.location,
    id: `to-${CITIES[index]!.id}`,
  }))
  return { markers, arcs }
}

export function HeroGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === 'light' ? 'light' : 'dark'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const palette = PALETTES[theme]

    let globe: Globe | null = null
    let raf = 0
    let visible = true
    let step = 0
    let lastStep = performance.now()
    const start = performance.now()

    const build = () => {
      globe?.destroy()
      const width = canvas.offsetWidth
      const height = canvas.offsetHeight
      if (!width || !height) return
      globe = createGlobe(canvas, {
        devicePixelRatio: ratio,
        width: width * ratio,
        height: height * ratio,
        phi: PHI,
        theta: THETA - TILT,
        scale: SCALE,
        mapSamples: 26000,
        mapBaseBrightness: 0,
        opacity: 0.95,
        arcWidth: 0.7,
        arcHeight: 0.42,
        markerElevation: 0.006,
        ...palette,
        ...frame(0),
      })
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!globe || !visible) return
      const t = (now - start) / 1000
      const changes: Parameters<Globe['update']>[0] = {
        // A slow sway around Bangladesh, never away from it.
        phi: PHI + Math.sin(t * 0.16) * 0.12,
        theta: THETA - TILT + Math.sin(t * 0.11) * 0.02,
      }
      if (now - lastStep > 1700) {
        lastStep = now
        step += 1
        Object.assign(changes, frame(step))
        showLabel(step)
      }
      globe.update(changes)
    }

    // One label at a time, on the newest order's city.
    const showLabel = (at: number) => {
      const city = ROUTE[at % ROUTE.length]!
      labels.current.forEach((node, index) =>
        node?.toggleAttribute('data-on', index === city)
      )
    }

    build()
    showLabel(0)
    if (!still) raf = requestAnimationFrame(tick)

    const resize = new ResizeObserver(() => build())
    resize.observe(canvas)
    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting)
    })
    seen.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      seen.disconnect()
      globe?.destroy()
    }
  }, [theme])

  return (
    <div className="hx-globe" aria-hidden="true">
      <canvas ref={canvasRef} />
      {CITIES.map((city, index) => (
        <span
          key={city.id}
          ref={(node) => {
            labels.current[index] = node
          }}
          className="hx-gl-label"
          data-city={city.id}
        >
          <b>New order</b> · {city.name} · {PRICES[index % PRICES.length]}
        </span>
      ))}
    </div>
  )
}
