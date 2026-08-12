/**
 * Builds the app icons from the brand wordmark in `public/`.
 *
 * Run after replacing a logo file:  pnpm icons
 *
 * Why generate rather than hand-crop: the wordmark is four letters 1180px wide,
 * and scaled into a 32px favicon it is an illegible smear. Every icon here is
 * built from the leading `n` glyph on the brand's ink tile instead, which is the
 * same lockup the in-app BrandMark uses at small sizes — so the browser tab and
 * the sidebar agree.
 *
 * The glyph's bounds are measured from the image's alpha channel rather than
 * hard-coded, so re-exporting the logo at another size or with different padding
 * does not silently produce an off-centre icon.
 */
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const WORDMARK = join(root, 'public', 'Ncom-1-Logo.png')
const INK = '#0b0b0c' // --ink, so the tile matches the app's own dark surfaces

/** Alpha-derived bounding boxes of each glyph, left to right. */
async function measureGlyphs(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const alphaAt = (x, y) => data[(y * width + x) * channels + 3]

  const columnHasInk = []
  for (let x = 0; x < width; x++) {
    let hasInk = false
    for (let y = 0; y < height; y++) {
      if (alphaAt(x, y) > 16) {
        hasInk = true
        break
      }
    }
    columnHasInk.push(hasInk)
  }

  const glyphs = []
  let start = -1
  for (let x = 0; x < width; x++) {
    if (columnHasInk[x] && start === -1) start = x
    if (!columnHasInk[x] && start !== -1) {
      glyphs.push({ left: start, right: x - 1 })
      start = -1
    }
  }
  if (start !== -1) glyphs.push({ left: start, right: width - 1 })

  let top = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) > 16) {
        if (top === -1) top = y
        bottom = y
        break
      }
    }
  }

  return { glyphs, top, bottom }
}

/** Rounded-square tile. Radius is a fraction of the side, so it scales. */
function tile(size) {
  const radius = Math.round(size * 0.22)
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
       <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${INK}"/>
     </svg>`
  )
}

async function buildIcon(size, glyph) {
  // 56% of the tile, which leaves the optical margin a mark this heavy needs —
  // filling more reads as cramped at 16px.
  const target = Math.round(size * 0.56)

  const mark = await sharp(WORDMARK)
    .extract({
      left: glyph.left,
      top: glyph.top,
      width: glyph.right - glyph.left + 1,
      height: glyph.bottom - glyph.top + 1,
    })
    .resize({ width: target, height: target, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return sharp(tile(size))
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
}

/**
 * Wraps a 32px PNG in an ICO container.
 *
 * `favicon.ico` is still requested by name by crawlers and older clients, and
 * sharp cannot write ICO. An ICO holding a single PNG frame is the modern form of
 * the format and is what every current browser expects.
 */
function pngToIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // one image

  const entry = Buffer.alloc(16)
  entry.writeUInt8(32, 0) // width
  entry.writeUInt8(32, 1) // height
  entry.writeUInt8(0, 2) // palette size (0 = truecolour)
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12) // offset to the data

  return Buffer.concat([header, entry, png])
}

async function main() {
  const { glyphs, top, bottom } = await measureGlyphs(WORDMARK)
  if (glyphs.length === 0) throw new Error(`No glyphs found in ${WORDMARK}`)

  const leading = { ...glyphs[0], top, bottom }
  console.log(
    `Measured ${glyphs.length} glyphs; using the first at x=${leading.left}–${leading.right}, y=${top}–${bottom}`
  )

  const outputs = [
    // Next.js App Router picks these up from src/app automatically and emits the
    // right <link> tags — no manual metadata.icons needed.
    { path: join(root, 'src', 'app', 'icon.png'), size: 512 },
    { path: join(root, 'src', 'app', 'apple-icon.png'), size: 180 },
  ]

  for (const output of outputs) {
    await writeFile(output.path, await buildIcon(output.size, leading))
    console.log(`Wrote ${output.path} (${output.size}px)`)
  }

  const favicon = join(root, 'src', 'app', 'favicon.ico')
  await writeFile(favicon, pngToIco(await buildIcon(32, leading)))
  console.log(`Wrote ${favicon} (32px ICO)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
