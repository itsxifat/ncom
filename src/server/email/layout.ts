import 'server-only'
import { env } from '@/lib/env'
import { BRAND_INK, BRAND_LIME, BRAND_WORDMARK_EMAIL } from '@/lib/brand'

/**
 * The shell and the building blocks every transactional email is assembled
 * from.
 *
 * Email is not the web. There is no cascade worth relying on, no flexbox, no
 * external stylesheet, and the most-used desktop client renders through Word.
 * So: tables for layout, every declaration inline on the element that needs it,
 * and nothing load-bearing inside the `<style>` block — what is in there is
 * progressive enhancement (dark mode, one mobile breakpoint) that a client is
 * free to throw away without the message breaking.
 *
 * The masthead is ink with the lime wordmark on it, not a white band with an
 * ink one. That is a deliberate difference from the app, where the mark goes
 * black on light ground: mail clients apply their own forced dark mode by
 * inverting backgrounds while leaving images alone, so a black logo on a white
 * card becomes a black logo on a dark card — invisible — in exactly the clients
 * that cannot be tested against. Ink is already dark, so it survives inversion
 * and renders identically everywhere.
 */

// ── Palette ───────────────────────────────────────────────────────────────
// Sampled from the app's own tokens so a message looks like it came from the
// same product, not from a mail vendor's default template.

const INK = BRAND_INK
const LIME = BRAND_LIME
const CANVAS = '#eceef1'
const PAPER = '#ffffff'
const TEXT = '#1c1d21'
const MUTED = '#6b6d76'
const HAIRLINE = '#e4e6ea'
const PANEL = '#f6f7f9'
const DANGER = '#b42318'

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace"

/**
 * Every interpolated value passes through this.
 *
 * These bodies carry user-controlled strings — workspace names, store names,
 * hostnames a tenant typed — and an unescaped angle bracket in a workspace name
 * would break the markup at best and inject at worst.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * An absolute URL for an asset in `public/`.
 *
 * Email has no origin to resolve a relative path against, so every image and
 * link has to be fully qualified. In local development `AUTH_URL` points at
 * localhost and the image simply will not load in a real mail client — which is
 * why every `<img>` below carries alt text worth reading.
 */
function assetUrl(path: string): string {
  return `${env.AUTH_URL.replace(/\/$/, '')}${path}`
}

// ── Blocks ────────────────────────────────────────────────────────────────

const P_STYLE = `margin:0 0 16px;font-size:15px;line-height:1.62;color:${TEXT};mso-line-height-rule:exactly;`

/** Body copy. Pass HTML — callers escape their own interpolations. */
export function paragraph(html: string): string {
  return `<p class="n-text" style="${P_STYLE}">${html}</p>`
}

/** The opening line, one step up in size. Use at most one per message. */
export function lead(html: string): string {
  return `<p class="n-text" style="margin:0 0 20px;font-size:16.5px;line-height:1.58;color:${TEXT};mso-line-height-rule:exactly;">${html}</p>`
}

/** Small print: legal notes, "you can ignore this", reassurances. */
export function fineprint(html: string): string {
  return `<p class="n-muted" style="margin:0 0 4px;font-size:13px;line-height:1.6;color:${MUTED};mso-line-height-rule:exactly;">${html}</p>`
}

/**
 * A one-time code.
 *
 * Rendered as large, letter-spaced, selectable text rather than an image, so it
 * can be copied on a phone, read aloud by a screen reader, and survive a client
 * that blocks remote images. The lime rule down the left edge is the only place
 * the brand colour appears in the body — it marks the one thing the reader
 * opened the mail for.
 */
export function codePanel(code: string, caption?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="n-panel" style="margin:0 0 20px;background:${PANEL};border:1px solid ${HAIRLINE};border-left:4px solid ${LIME};border-radius:14px;">
    <tr><td align="center" style="padding:22px 20px 18px;">
      <div class="n-code" style="font-family:${MONO};font-size:34px;line-height:1.1;font-weight:700;letter-spacing:0.24em;color:${INK};mso-line-height-rule:exactly;">${escapeHtml(code)}</div>
      ${caption ? `<div class="n-muted" style="margin-top:10px;font-size:12.5px;line-height:1.5;color:${MUTED};">${escapeHtml(caption)}</div>` : ''}
    </td></tr>
  </table>`
}

/**
 * The primary action.
 *
 * The VML block is not optional decoration: Outlook's Word renderer ignores
 * padding and background on an anchor, so without it the button arrives as a
 * bare blue underlined link. The `<!--[if !mso]>` wrapper hides the real button
 * from Outlook so the two never both render.
 */
export function button(label: string, url: string): string {
  const href = escapeHtml(url)
  const text = escapeHtml(label)

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">
    <tr><td>
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${INK}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" class="n-btn" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-size:15px;font-weight:600;line-height:1;letter-spacing:-0.01em;">${text}</a>
      <!--<![endif]-->
    </td></tr>
  </table>`
}

/** The same URL as text, for anyone whose client swallowed the button. */
export function fallbackLink(url: string): string {
  return `<p class="n-muted" style="margin:0 0 4px;font-size:12.5px;line-height:1.6;color:${MUTED};word-break:break-all;">Or paste this into your browser:<br><a href="${escapeHtml(url)}" style="color:${MUTED};">${escapeHtml(url)}</a></p>`
}

/**
 * Label/value pairs — an order number, a plan, a total.
 *
 * A table rather than sentences because this is reference material: the reader
 * is scanning for one figure, and prose makes them read the whole paragraph to
 * find it.
 */
export function dataTable(rows: { label: string; value: string }[]): string {
  const body = rows
    .map(
      (row, index) =>
        `<tr>
          <td class="n-muted" style="padding:${index === 0 ? '0' : '11px'} 0 11px;font-size:13.5px;line-height:1.4;color:${MUTED};white-space:nowrap;">${escapeHtml(row.label)}</td>
          <td align="right" class="n-code" style="padding:${index === 0 ? '0' : '11px'} 0 11px;font-size:14.5px;line-height:1.4;font-weight:600;color:${TEXT};">${escapeHtml(row.value)}</td>
        </tr>
        ${index < rows.length - 1 ? `<tr><td colspan="2" class="n-rule" style="height:1px;line-height:1px;font-size:0;background:${HAIRLINE};">&nbsp;</td></tr>` : ''}`
    )
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="n-panel" style="margin:0 0 22px;padding:18px 20px;background:${PANEL};border:1px solid ${HAIRLINE};border-radius:14px;">
    ${body}
  </table>`
}

/**
 * A filled bar showing how much of an allowance is gone.
 *
 * Built from two nested table cells with background colours, which is the only
 * way to draw a bar that survives Outlook. The number is repeated in text
 * beside it — the bar is the glance, the text is the fact, and a client that
 * strips backgrounds still delivers the fact.
 */
export function meter(percent: number, tone: 'warn' | 'danger'): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const fill = tone === 'danger' ? DANGER : INK

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
    <tr><td class="n-muted" style="padding-bottom:8px;font-size:13px;line-height:1.4;color:${MUTED};">${clamped}% used</td></tr>
    <tr><td class="n-track" style="background:${HAIRLINE};border-radius:999px;font-size:0;line-height:0;">
      <table role="presentation" width="${clamped}%" cellpadding="0" cellspacing="0" border="0" style="min-width:8px;"><tr>
        <td class="${tone === 'danger' ? 'n-fill-danger' : 'n-fill'}" style="height:10px;line-height:10px;font-size:0;background:${fill};border-radius:999px;">&nbsp;</td>
      </tr></table>
    </td></tr>
  </table>`
}

/** A bordered aside for a consequence the reader needs to notice. */
export function callout(html: string, tone: 'neutral' | 'danger' = 'neutral') {
  const edge = tone === 'danger' ? DANGER : INK
  const color = tone === 'danger' ? DANGER : TEXT
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="n-panel${tone === 'danger' ? '' : ' n-edge'}" style="margin:0 0 20px;background:${PANEL};border:1px solid ${HAIRLINE};border-left:4px solid ${edge};border-radius:14px;">
    <tr><td class="${tone === 'danger' ? 'n-danger' : 'n-text'}" style="padding:16px 18px;font-size:14px;line-height:1.6;color:${color};mso-line-height-rule:exactly;">${html}</td></tr>
  </table>`
}

// ── Shell ─────────────────────────────────────────────────────────────────

export interface EmailShell {
  /**
   * The line the inbox shows beside the subject.
   *
   * Set it deliberately on every message: left empty, clients scrape the first
   * words of the body, which for these templates is boilerplate like "Enter
   * this code to". Written well it is a second subject line and the cheapest
   * open-rate lever an email has.
   */
  preheader: string
  /** Small caps label above the heading, naming what kind of mail this is. */
  eyebrow: string
  heading: string
  /** Pre-rendered blocks from this module. */
  body: string
  /** Replaces the default "you received this because…" line. */
  footerNote?: string
}

/**
 * Wraps rendered blocks in the branded shell.
 *
 * The `<style>` block carries only enhancements — a dark palette for clients
 * that honour `prefers-color-scheme`, and one breakpoint that tightens padding
 * on a narrow phone. Everything the message needs to be readable is inline, so
 * Gmail's classic stripping of head styles costs nothing but polish.
 */
export function renderShell(shell: EmailShell): string {
  return `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(shell.heading)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  /* Enhancement only — every rule here has an inline fallback, and every
     selector is a single class so nothing here can out-specify anything else
     here. Elements carry exactly one of n-text / n-muted / n-code. */
  @media (prefers-color-scheme: dark) {
    .n-canvas { background:#08080a !important; }
    .n-card { background:#141417 !important; border-color:#26262b !important; }
    .n-footer { background:#0f0f12 !important; border-color:#26262b !important; }
    .n-text { color:#f2f2f3 !important; }
    .n-muted { color:#9b9ca4 !important; }
    .n-code { color:#f2f2f3 !important; }
    .n-strong { color:#ffffff !important; }
    .n-panel { background:#1c1c20 !important; border-color:#2c2c32 !important; }
    .n-rule { background:#2c2c32 !important; }
    .n-track { background:#2c2c32 !important; }
    /* An ink fill would vanish against the dark track. */
    .n-fill { background:${LIME} !important; }
    .n-edge { border-left-color:${LIME} !important; }
    /* The light-mode danger red fails against ink; this is the same hue lifted
       until it passes. */
    .n-danger { color:#ff9c94 !important; }
    .n-fill-danger { background:#f0574c !important; }
    /* Ink on ink. The button has to invert, not just darken. */
    .n-btn { background:${LIME} !important; color:${INK} !important; }
    .n-text a { color:#e6ff70 !important; }
    .n-muted a { color:#9b9ca4 !important; }
  }
  @media only screen and (max-width:600px) {
    .n-pad { padding-left:24px !important; padding-right:24px !important; }
    .n-h1 { font-size:23px !important; }
  }
  a { color:${INK}; }
</style>
</head>
<body class="n-canvas" style="margin:0;padding:0;width:100%;background:${CANVAS};font-family:${FONT};-webkit-font-smoothing:antialiased;">

<!-- Preview text. The zero-width spaces stop the client padding the preview
     out with the first words of the body. -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CANVAS};opacity:0;">
  ${escapeHtml(shell.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="n-canvas" style="background:${CANVAS};">
  <tr><td align="center" style="padding:36px 12px 40px;">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="n-card" style="max-width:560px;background:${PAPER};border:1px solid ${HAIRLINE};border-radius:20px;overflow:hidden;">

      <!-- Masthead. Ink so it survives a client's forced dark mode unchanged. -->
      <tr><td style="background:${INK};padding:22px 32px 20px;">
        <!-- The type styling is for the *alt* text: Outlook and most corporate
             clients block remote images by default, and an unstyled alt would
             fall back to small dark-grey text on this ink band — invisible
             exactly where the brand is supposed to be. Styled, a blocked logo
             degrades to a wordmark set in type. -->
        <img src="${assetUrl(BRAND_WORDMARK_EMAIL.src)}" width="112" height="25" alt="NCOM" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:112px;color:${LIME};font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:0.06em;line-height:25px;">
      </td></tr>
      <tr><td style="height:3px;line-height:3px;font-size:0;background:${LIME};">&nbsp;</td></tr>

      <!-- Message -->
      <tr><td class="n-pad" style="padding:32px 32px 28px;">
        <p class="n-muted" style="margin:0 0 10px;font-size:11.5px;line-height:1.4;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">${escapeHtml(shell.eyebrow)}</p>
        <h1 class="n-h1 n-text" style="margin:0 0 18px;font-size:25px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${TEXT};mso-line-height-rule:exactly;">${escapeHtml(shell.heading)}</h1>
        ${shell.body}
      </td></tr>

      <!-- Footer -->
      <tr><td class="n-pad n-footer" style="padding:20px 32px 24px;background:${PANEL};border-top:1px solid ${HAIRLINE};">
        <p class="n-muted" style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
          ${escapeHtml(shell.footerNote ?? 'You received this because this address is used on NCOM. If it was not you, you can safely ignore this email.')}
        </p>
      </td></tr>

    </table>

    <p class="n-muted" style="margin:18px 0 0;font-size:11.5px;line-height:1.5;color:${MUTED};text-align:center;">
      NCOM — landing pages that look designed, not templated.
    </p>

  </td></tr>
</table>
</body></html>`
}
