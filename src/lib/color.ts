/**
 * Colour parsing and formatting for the editor's own picker.
 *
 * The editor stores colours as strings that `isColor` in
 * `modules/sections/elementStyle.ts` accepts, because that validator is the
 * gate every stored colour passes on its way into a stylesheet. Everything here
 * therefore reads that same closed grammar and only ever emits hex — `#rrggbb`
 * when a colour is opaque, `#rrggbbaa` when it is not.
 *
 * Hex rather than `rgba()` for two reasons worth writing down: it round-trips
 * through a text field without whitespace ambiguity, and it is one token, so a
 * colour never gets split across a comma by anything that later tries to parse
 * a declaration.
 *
 * Nothing here throws. A value that cannot be read comes back `null` and the
 * caller falls back to "unset", which is the same thing the rest of the design
 * layer means by an absent property: inherit.
 */

export interface Hsva {
  /** 0–360. */
  h: number
  /** 0–100. */
  s: number
  /** 0–100. */
  v: number
  /** 0–1. */
  a: number
}

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0–1. */
  a: number
}

const HEX_RE = /^#([0-9a-fA-F]{3,8})$/
const RGB_RE =
  /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
const HSL_RE =
  /^hsla?\(\s*([\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** An alpha component written either as `0.4` or as `40%`. */
function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1
  const value = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw)
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1
}

/**
 * A colour string as RGBA, or null if it is not one this editor can edit.
 *
 * `transparent`, `currentColor` and `var(--…)` are all legal stored values but
 * none of them is a point in colour space, so they read as null: the picker
 * shows them as "not a fixed colour" rather than silently resolving them to
 * black and writing that back the first time someone opens the popover.
 */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value) return null

  const hex = HEX_RE.exec(value)
  if (hex) {
    const digits = hex[1]!
    // 3 and 4 digit forms double each nibble, exactly as CSS does.
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = digits.split('').map((d) => parseInt(d + d, 16))
      return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 }
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = parseInt(digits.slice(0, 2), 16)
      const g = parseInt(digits.slice(2, 4), 16)
      const b = parseInt(digits.slice(4, 6), 16)
      const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
      return { r, g, b, a }
    }
    return null
  }

  const rgb = RGB_RE.exec(value)
  if (rgb) {
    return {
      r: clamp(Math.round(Number(rgb[1])), 0, 255),
      g: clamp(Math.round(Number(rgb[2])), 0, 255),
      b: clamp(Math.round(Number(rgb[3])), 0, 255),
      a: parseAlpha(rgb[4]),
    }
  }

  const hsl = HSL_RE.exec(value)
  if (hsl) {
    const rgba = hslToRgb(
      Number(hsl[1]),
      clamp(Number(hsl[2]), 0, 100),
      clamp(Number(hsl[3]), 0, 100)
    )
    return { ...rgba, a: parseAlpha(hsl[4]) }
  }

  return null
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, 'a'> {
  const saturation = s / 100
  const lightness = l / 100
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const hue = ((h % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function rgbaToHsva({ r, g, b, a }: Rgba): Hsva {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6)
    else if (max === green) h = 60 * ((blue - red) / delta + 2)
    else h = 60 * ((red - green) / delta + 4)
  }
  if (h < 0) h += 360

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
    a,
  }
}

export function hsvaToRgba({ h, s, v, a }: Hsva): Rgba {
  const saturation = s / 100
  const value = v / 100
  const c = value * saturation
  const hue = ((h % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  }
}

function pad(value: number): string {
  return value.toString(16).padStart(2, '0')
}

/**
 * RGBA as the hex this editor stores.
 *
 * The alpha byte is omitted when the colour is opaque, so an ordinary colour
 * stays the six-digit hex a merchant recognises and can paste elsewhere —
 * `#3b82f6ff` is the same colour but reads as a machine wrote it.
 */
export function formatHex({ r, g, b, a }: Rgba): string {
  const base = `#${pad(clamp(Math.round(r), 0, 255))}${pad(clamp(Math.round(g), 0, 255))}${pad(clamp(Math.round(b), 0, 255))}`
  if (a >= 1) return base
  return `${base}${pad(clamp(Math.round(a * 255), 0, 255))}`
}

export function hsvaToHex(hsva: Hsva): string {
  return formatHex(hsvaToRgba(hsva))
}

/** A CSS colour for previewing a value, including the ones we cannot edit. */
export function previewColor(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value.trim()) return 'transparent'
  return value.trim()
}

/**
 * Whether a colour needs dark text drawn on top of it.
 *
 * Used for the contrast of a swatch's own tick mark. Relative luminance rather
 * than a naive average, because a mid green and a mid blue have very different
 * apparent brightness and averaging puts a white tick on the green.
 */
export function isLightColor(value: string | null | undefined): boolean {
  const rgba = parseColor(value)
  if (!rgba) return true
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(rgba.r) +
    0.7152 * channel(rgba.g) +
    0.0722 * channel(rgba.b)
  // Alpha-weighted against a light backdrop: a 10%-opacity black is a pale
  // grey on screen, and a white tick on it would be the unreadable one.
  return luminance * rgba.a + (1 - rgba.a) > 0.5
}

/** The CSS for the checkerboard shown behind a partly transparent swatch. */
export const CHECKERBOARD =
  'linear-gradient(45deg,rgba(0,0,0,.16) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.16) 75%),linear-gradient(45deg,rgba(0,0,0,.16) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.16) 75%)'
