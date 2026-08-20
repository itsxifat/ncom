import 'server-only'
import { toSVG } from 'bwip-js/node'
import { toCourierInvoice } from '@/server/courier/invoice'

/**
 * The barcode printed on a parcel sticker.
 *
 * CODE 128 rather than a QR code, because the thing reading it is usually a
 * ৳1,500 laser gun on a packing table, and those read 1D symbologies only. The
 * phone camera on the scan page reads CODE 128 too, so one symbol serves both.
 *
 * Rendered to SVG on the server. A canvas or PNG would be rasterised at some
 * fixed resolution and then scaled by the printer driver, which is how bars end
 * up a fractional pixel wide and a scanner ends up refusing the label; vector
 * bars land on exact device pixels at whatever DPI the printer runs.
 *
 * The text is the courier-safe form of the order number — `#1001` becomes
 * `1001` — for the same reason the courier gets that form: `#` is not in CODE
 * 128's subset B in a way most guns emit cleanly, and the number under the bars
 * has to match what the scan page will look up.
 */
export function orderBarcodeSvg(orderNumber: string): {
  svg: string
  encoded: string
} | null {
  const encoded = toCourierInvoice(orderNumber)
  if (!encoded) return null

  try {
    const svg = toSVG({
      bcid: 'code128',
      text: encoded,
      // Millimetres of bar height. Tall enough for a gun held at an angle over
      // a curled sticker, short enough to leave the address room on 4×6.
      height: 12,
      scale: 3,
      // The human-readable line matters as much as the bars: a scanner that
      // will not read a smudged label leaves someone typing the number in.
      includetext: true,
      textxalign: 'center',
      textsize: 9,
    })
    return { svg, encoded }
  } catch {
    // A label with no barcode still carries the address and the amount, which
    // is the part that cannot be recovered by typing. Losing the whole print
    // run over one unencodable order number would be the worse failure.
    return null
  }
}
