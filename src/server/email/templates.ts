import 'server-only'

/**
 * Transactional email bodies.
 *
 * Plain string templates with inline styles, and no shared CSS file: email
 * clients strip <style> blocks and have no cascade worth relying on, so
 * anything not inlined on the element does not render. Every message ships a
 * text alternative because a code-only email that arrives as an empty body in a
 * text-only client is a support ticket.
 *
 * Every interpolated value passes through `escapeHtml`. These bodies carry
 * user-controlled strings (workspace names, domain names typed by a tenant) and
 * an unescaped apostrophe or angle bracket in a workspace name would break the
 * markup at best and inject at worst.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const BRAND = '#0B3B2E'
const ACCENT = '#C9F24D'

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr><td style="background:${BRAND};padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">NCOM</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1c1917;">${escapeHtml(heading)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#fafaf9;border-top:1px solid #e7e5e4;">
          <p style="margin:0;font-size:12px;color:#78716c;">You received this because someone used this address on NCOM. If it wasn't you, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

const P = 'margin:0 0 14px;font-size:15px;line-height:1.55;color:#44403c;'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * The verification code email.
 *
 * The code is rendered as large, letter-spaced, selectable text rather than an
 * image, so it can be copied on a phone and read by a screen reader.
 */
export function verificationCodeEmail(input: {
  code: string
  expiresInMinutes: number
}): RenderedEmail {
  const code = escapeHtml(input.code)

  return {
    subject: `${input.code} is your NCOM verification code`,
    html: layout(
      'Confirm your email address',
      `<p style="${P}">Enter this code to finish setting up your NCOM account:</p>
       <p style="margin:0 0 16px;padding:16px;background:#fafaf9;border:1px dashed #d6d3d1;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:0.22em;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</p>
       <p style="${P}">It expires in ${input.expiresInMinutes} minutes and can only be used once.</p>
       <p style="margin:0;font-size:13px;color:#78716c;">Never share this code. NCOM staff will not ask you for it.</p>`
    ),
    text: `Your NCOM verification code is ${input.code}\n\nIt expires in ${input.expiresInMinutes} minutes and can only be used once.\n\nNever share this code — NCOM staff will not ask you for it.`,
  }
}

export function passwordResetCodeEmail(input: {
  code: string
  expiresInMinutes: number
}): RenderedEmail {
  return {
    subject: `${input.code} is your NCOM password reset code`,
    html: layout(
      'Reset your password',
      `<p style="${P}">Use this code to set a new password:</p>
       <p style="margin:0 0 16px;padding:16px;background:#fafaf9;border:1px dashed #d6d3d1;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:0.22em;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(input.code)}</p>
       <p style="${P}">It expires in ${input.expiresInMinutes} minutes. If you didn't ask for this, no action is needed — your password has not changed.</p>`
    ),
    text: `Your NCOM password reset code is ${input.code}\n\nIt expires in ${input.expiresInMinutes} minutes.\n\nIf you didn't ask for this, no action is needed — your password has not changed.`,
  }
}

export function domainVerifiedEmail(input: {
  hostname: string
  storeName: string
}): RenderedEmail {
  return {
    subject: `${input.hostname} is live`,
    html: layout(
      'Your domain is connected',
      `<p style="${P}"><strong>${escapeHtml(input.hostname)}</strong> is verified and now serving <strong>${escapeHtml(input.storeName)}</strong>.</p>
       <p style="${P}">DNS changes can take a little longer to reach every network, so if you still see the old site, give it a few minutes and try a fresh browser.</p>`
    ),
    text: `${input.hostname} is verified and now serving ${input.storeName}.\n\nDNS changes can take a little longer to reach every network — if you still see the old site, wait a few minutes and try a fresh browser.`,
  }
}

export function usageWarningEmail(input: {
  workspaceName: string
  quotaLabel: string
  usedLabel: string
  limitLabel: string
  percent: number
}): RenderedEmail {
  return {
    subject: `${input.workspaceName} has used ${input.percent}% of its ${input.quotaLabel.toLowerCase()}`,
    html: layout(
      `You're at ${input.percent}% of your ${escapeHtml(input.quotaLabel.toLowerCase())}`,
      `<p style="${P}"><strong>${escapeHtml(input.workspaceName)}</strong> has used ${escapeHtml(input.usedLabel)} of ${escapeHtml(input.limitLabel)}.</p>
       <p style="${P}">Once the limit is reached, new activity in this area is paused until the allowance resets or the plan is upgraded.</p>`
    ),
    text: `${input.workspaceName} has used ${input.usedLabel} of ${input.limitLabel} (${input.percent}%) of its ${input.quotaLabel.toLowerCase()}.\n\nOnce the limit is reached, new activity in this area is paused until the allowance resets or the plan is upgraded.`,
  }
}

export function planActivatedEmail(input: {
  workspaceName: string
  planName: string
  totalLabel: string
  couponCode: string | null
}): RenderedEmail {
  const couponLine = input.couponCode
    ? `<p style="${P}">Applied with code <strong>${escapeHtml(input.couponCode)}</strong>.</p>`
    : ''

  return {
    subject: `${input.planName} is active on ${input.workspaceName}`,
    html: layout(
      `${escapeHtml(input.planName)} is active`,
      `<p style="${P}"><strong>${escapeHtml(input.workspaceName)}</strong> is now on the <strong>${escapeHtml(input.planName)}</strong> plan.</p>
       <p style="${P}">Total: <strong>${escapeHtml(input.totalLabel)}</strong></p>
       ${couponLine}
       <p style="margin:0;font-size:13px;color:#78716c;">Your new limits are in effect immediately.</p>`
    ),
    text: `${input.workspaceName} is now on the ${input.planName} plan.\n\nTotal: ${input.totalLabel}${input.couponCode ? `\nCode applied: ${input.couponCode}` : ''}\n\nYour new limits are in effect immediately.`,
  }
}

export function planOrderPendingEmail(input: {
  workspaceName: string
  planName: string
  totalLabel: string
}): RenderedEmail {
  return {
    subject: `We've recorded your ${input.planName} request`,
    html: layout(
      'Almost there',
      `<p style="${P}">We've recorded a request to move <strong>${escapeHtml(input.workspaceName)}</strong> onto <strong>${escapeHtml(input.planName)}</strong> for ${escapeHtml(input.totalLabel)}.</p>
       <p style="${P}">Online payment isn't open yet, so our team will contact you to complete this and switch the plan on. Nothing has changed on your workspace in the meantime.</p>`
    ),
    text: `We've recorded a request to move ${input.workspaceName} onto ${input.planName} for ${input.totalLabel}.\n\nOnline payment isn't open yet, so our team will contact you to complete this and switch the plan on. Nothing has changed on your workspace in the meantime.`,
  }
}

export function teamInvitationEmail(input: {
  workspaceName: string
  inviterName: string | null
  acceptUrl: string
  role: string
}): RenderedEmail {
  const inviter = input.inviterName ?? 'Someone'

  return {
    subject: `${inviter} invited you to ${input.workspaceName} on NCOM`,
    html: layout(
      `Join ${escapeHtml(input.workspaceName)}`,
      `<p style="${P}">${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(input.workspaceName)}</strong> as ${escapeHtml(input.role.toLowerCase())}.</p>
       <p style="margin:0 0 18px;"><a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600;">Accept invitation</a></p>
       <p style="margin:0;font-size:13px;color:#78716c;word-break:break-all;">Or paste this link into your browser: ${escapeHtml(input.acceptUrl)}</p>`
    ),
    text: `${inviter} invited you to join ${input.workspaceName} as ${input.role.toLowerCase()}.\n\nAccept the invitation: ${input.acceptUrl}`,
  }
}

/** Exported for the admin preview, which renders a sample of each template. */
export const ACCENT_COLOR = ACCENT

export function orderDispatchedEmail(input: {
  orderNumber: string
  storeName: string
  trackingUrl: string
  courierName: string
}): RenderedEmail {
  return {
    subject: `Order ${input.orderNumber} is on its way`,
    html: layout(
      'Your order is with the courier',
      `<p style="${P}">Order <strong>${escapeHtml(input.orderNumber)}</strong> from ${escapeHtml(input.storeName)} has been handed to ${escapeHtml(input.courierName)}.</p>
       <p style="${P}">You can follow it here, and the page updates itself as the courier reports progress:</p>
       <p style="${P}"><a href="${escapeHtml(input.trackingUrl)}" style="color:${ACCENT};">Track your delivery</a></p>
       <p style="${P}">Keep this link — it stays live until the parcel reaches you.</p>`
    ),
    text: `Order ${input.orderNumber} from ${input.storeName} has been handed to ${input.courierName}.\n\nTrack your delivery: ${input.trackingUrl}\n\nKeep this link — it stays live until the parcel reaches you.`,
  }
}
