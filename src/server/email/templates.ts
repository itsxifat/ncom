import 'server-only'
import {
  button,
  callout,
  codePanel,
  dataTable,
  escapeHtml,
  fallbackLink,
  fineprint,
  lead,
  meter,
  paragraph,
  renderShell,
} from './layout'

/**
 * Transactional email bodies.
 *
 * Each one is a subject, a preheader, and a stack of blocks from `layout.ts` —
 * no message builds its own markup, so restyling every email the platform sends
 * is a change in one file rather than eight.
 *
 * Every message ships a text alternative. It is written as prose a person would
 * send, not as the HTML with the tags taken out: a text part is what a
 * smartwatch reads aloud and what a spam filter compares against the HTML, and
 * a stub there costs deliverability.
 */

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// ── Identity ──────────────────────────────────────────────────────────────

/**
 * The verification code email.
 *
 * The subject leads with the code so it can be read from a lock-screen
 * notification without opening anything — the fastest possible path through a
 * signup, and the reason `emailService.redactSubject` exists to keep it out of
 * the stored log.
 */
export function verificationCodeEmail(input: {
  code: string
  expiresInMinutes: number
}): RenderedEmail {
  return {
    subject: `${input.code} is your NCOM verification code`,
    html: renderShell({
      preheader: `Your code expires in ${input.expiresInMinutes} minutes.`,
      eyebrow: 'Verify your email',
      heading: 'Confirm your email address',
      body: [
        lead('Enter this code to finish setting up your NCOM account.'),
        codePanel(
          input.code,
          `Expires in ${input.expiresInMinutes} minutes · single use`
        ),
        fineprint(
          'Never share this code. NCOM staff will never ask you for it.'
        ),
      ].join(''),
      footerNote:
        'You received this because someone entered this address when signing up for NCOM. If it was not you, you can safely ignore this email — no account is created without the code.',
    }),
    text: [
      `Your NCOM verification code is ${input.code}`,
      '',
      `Enter it to finish setting up your account. It expires in ${input.expiresInMinutes} minutes and can only be used once.`,
      '',
      'Never share this code — NCOM staff will never ask you for it.',
      '',
      'If you did not sign up for NCOM, you can ignore this email.',
    ].join('\n'),
  }
}

export function passwordResetCodeEmail(input: {
  code: string
  expiresInMinutes: number
}): RenderedEmail {
  return {
    subject: `${input.code} is your NCOM password reset code`,
    html: renderShell({
      preheader: `Your reset code expires in ${input.expiresInMinutes} minutes.`,
      eyebrow: 'Password reset',
      heading: 'Set a new password',
      body: [
        lead('Use this code to choose a new password for your account.'),
        codePanel(
          input.code,
          `Expires in ${input.expiresInMinutes} minutes · single use`
        ),
        callout(
          '<strong>Did not ask for this?</strong> No action is needed. Your password has not changed and this code expires on its own.'
        ),
      ].join(''),
      footerNote:
        'You received this because a password reset was requested for this address on NCOM.',
    }),
    text: [
      `Your NCOM password reset code is ${input.code}`,
      '',
      `It expires in ${input.expiresInMinutes} minutes and can only be used once.`,
      '',
      'If you did not ask for this, no action is needed — your password has not changed and the code expires on its own.',
    ].join('\n'),
  }
}

export function teamInvitationEmail(input: {
  workspaceName: string
  inviterName: string | null
  acceptUrl: string
  role: string
}): RenderedEmail {
  const inviter = input.inviterName ?? 'Someone'
  const role = input.role.toLowerCase()
  // Roles are stored as enum names; ALL CAPS in a table cell reads as shouting.
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

  return {
    subject: `${inviter} invited you to ${input.workspaceName} on NCOM`,
    html: renderShell({
      preheader: `You have been added as ${role}. The invitation link is inside.`,
      eyebrow: 'Team invitation',
      heading: `Join ${input.workspaceName}`,
      body: [
        lead(
          `<strong class="n-strong">${escapeHtml(inviter)}</strong> invited you to work in <strong class="n-strong">${escapeHtml(input.workspaceName)}</strong> on NCOM.`
        ),
        dataTable([
          { label: 'Workspace', value: input.workspaceName },
          { label: 'Your role', value: roleLabel },
          { label: 'Invited by', value: inviter },
        ]),
        button('Accept invitation', input.acceptUrl),
        fallbackLink(input.acceptUrl),
      ].join(''),
      footerNote:
        'You received this because your address was invited to a workspace on NCOM. If you were not expecting it, you can ignore this email.',
    }),
    text: [
      `${inviter} invited you to join ${input.workspaceName} on NCOM as ${role}.`,
      '',
      `Accept the invitation: ${input.acceptUrl}`,
      '',
      'If you were not expecting this, you can ignore this email.',
    ].join('\n'),
  }
}

// ── Workspace ─────────────────────────────────────────────────────────────

export function domainVerifiedEmail(input: {
  hostname: string
  storeName: string
}): RenderedEmail {
  return {
    subject: `${input.hostname} is live`,
    html: renderShell({
      preheader: `${input.hostname} is verified and serving ${input.storeName}.`,
      eyebrow: 'Domain connected',
      heading: 'Your domain is live',
      body: [
        lead(
          `<strong class="n-strong">${escapeHtml(input.hostname)}</strong> is verified and now serving your store.`
        ),
        dataTable([
          { label: 'Domain', value: input.hostname },
          { label: 'Store', value: input.storeName },
          { label: 'Status', value: 'Verified · serving traffic' },
        ]),
        button(`Visit ${input.hostname}`, `https://${input.hostname}`),
        fineprint(
          'DNS changes can take a little longer to reach every network. If you still see the old site, give it a few minutes and try a fresh browser or a private window.'
        ),
      ].join(''),
      footerNote:
        'You received this because you are an owner of the workspace this domain belongs to.',
    }),
    text: [
      `${input.hostname} is verified and now serving ${input.storeName}.`,
      '',
      `Visit it: https://${input.hostname}`,
      '',
      'DNS changes can take a little longer to reach every network — if you still see the old site, wait a few minutes and try a fresh browser.',
    ].join('\n'),
  }
}

export function usageWarningEmail(input: {
  workspaceName: string
  quotaLabel: string
  usedLabel: string
  limitLabel: string
  percent: number
}): RenderedEmail {
  const quota = input.quotaLabel.toLowerCase()
  const atLimit = input.percent >= 100

  return {
    subject: `${input.workspaceName} has used ${input.percent}% of its ${quota}`,
    html: renderShell({
      preheader: atLimit
        ? `${input.quotaLabel} is used up — new activity in this area is paused.`
        : `${input.usedLabel} of ${input.limitLabel} used this period.`,
      eyebrow: atLimit ? 'Limit reached' : 'Approaching limit',
      heading: atLimit
        ? `You have used all of your ${quota}`
        : `You are at ${input.percent}% of your ${quota}`,
      body: [
        lead(
          `<strong class="n-strong">${escapeHtml(input.workspaceName)}</strong> has used <strong class="n-strong">${escapeHtml(input.usedLabel)}</strong> of ${escapeHtml(input.limitLabel)} this period.`
        ),
        meter(input.percent, atLimit ? 'danger' : 'warn'),
        dataTable([
          { label: 'Allowance', value: input.quotaLabel },
          { label: 'Used', value: input.usedLabel },
          { label: 'Included', value: input.limitLabel },
        ]),
        atLimit
          ? callout(
              'New activity in this area is paused until the allowance resets or the plan is upgraded.',
              'danger'
            )
          : paragraph(
              'Once the limit is reached, new activity in this area is paused until the allowance resets or the plan is upgraded.'
            ),
      ].join(''),
      footerNote:
        'You received this because you are the owner of this workspace. Usage alerts are sent once per threshold, per period.',
    }),
    text: [
      `${input.workspaceName} has used ${input.usedLabel} of ${input.limitLabel} (${input.percent}%) of its ${quota}.`,
      '',
      atLimit
        ? 'New activity in this area is paused until the allowance resets or the plan is upgraded.'
        : 'Once the limit is reached, new activity in this area is paused until the allowance resets or the plan is upgraded.',
    ].join('\n'),
  }
}

// ── Billing ───────────────────────────────────────────────────────────────

export function planActivatedEmail(input: {
  workspaceName: string
  planName: string
  totalLabel: string
  couponCode: string | null
}): RenderedEmail {
  const rows = [
    { label: 'Workspace', value: input.workspaceName },
    { label: 'Plan', value: input.planName },
    { label: 'Total', value: input.totalLabel },
  ]
  if (input.couponCode) {
    rows.push({ label: 'Code applied', value: input.couponCode })
  }

  return {
    subject: `${input.planName} is active on ${input.workspaceName}`,
    html: renderShell({
      preheader: `Your new limits are in effect immediately. Total ${input.totalLabel}.`,
      eyebrow: 'Plan activated',
      heading: `${input.planName} is active`,
      body: [
        lead(
          `<strong class="n-strong">${escapeHtml(input.workspaceName)}</strong> is now on the <strong class="n-strong">${escapeHtml(input.planName)}</strong> plan.`
        ),
        dataTable(rows),
        fineprint('Your new limits are in effect immediately.'),
      ].join(''),
      footerNote:
        'You received this because you made a billing change on this workspace.',
    }),
    text: [
      `${input.workspaceName} is now on the ${input.planName} plan.`,
      '',
      `Total: ${input.totalLabel}`,
      ...(input.couponCode ? [`Code applied: ${input.couponCode}`] : []),
      '',
      'Your new limits are in effect immediately.',
    ].join('\n'),
  }
}

export function planOrderPendingEmail(input: {
  workspaceName: string
  planName: string
  totalLabel: string
}): RenderedEmail {
  return {
    subject: `We've recorded your ${input.planName} request`,
    html: renderShell({
      preheader:
        'Our team will contact you to complete it. Nothing has changed on your workspace yet.',
      eyebrow: 'Awaiting payment',
      heading: 'Almost there',
      body: [
        lead(
          `We have recorded a request to move <strong class="n-strong">${escapeHtml(input.workspaceName)}</strong> onto <strong class="n-strong">${escapeHtml(input.planName)}</strong>.`
        ),
        dataTable([
          { label: 'Workspace', value: input.workspaceName },
          { label: 'Requested plan', value: input.planName },
          { label: 'Total', value: input.totalLabel },
        ]),
        callout(
          'Online payment is not open yet, so our team will contact you to complete this and switch the plan on. <strong>Nothing has changed on your workspace in the meantime.</strong>'
        ),
      ].join(''),
      footerNote:
        'You received this because you requested a plan change on this workspace.',
    }),
    text: [
      `We have recorded a request to move ${input.workspaceName} onto ${input.planName} for ${input.totalLabel}.`,
      '',
      'Online payment is not open yet, so our team will contact you to complete this and switch the plan on.',
      '',
      'Nothing has changed on your workspace in the meantime.',
    ].join('\n'),
  }
}

// ── Platform ──────────────────────────────────────────────────────────────

/**
 * The message /admin/email sends to prove a server works.
 *
 * Branded like everything else on purpose: this is the one email an operator
 * sees before any real one goes out, so it is also the proof that images
 * resolve, that the masthead renders, and that the sending domain is not
 * mangling the markup. A bare "test ok" would answer none of that.
 */
export function smtpTestEmail(input: {
  purpose: string
  host: string
}): RenderedEmail {
  return {
    subject: `NCOM SMTP test — ${input.purpose}`,
    html: renderShell({
      preheader: `Delivery works for ${input.purpose} via ${input.host}.`,
      eyebrow: 'Delivery test',
      heading: 'This server works',
      body: [
        lead(
          `If you are reading this, NCOM can send <strong class="n-strong">${escapeHtml(input.purpose)}</strong> mail through this server.`
        ),
        dataTable([
          { label: 'Purpose', value: input.purpose },
          { label: 'SMTP host', value: input.host },
          { label: 'Sent at', value: new Date().toUTCString() },
        ]),
        fineprint(
          'Check that the logo above loaded and the layout is intact — that confirms images and markup survive this route, not just the connection.'
        ),
      ].join(''),
      footerNote:
        'You received this because someone ran a delivery test from the NCOM admin panel.',
    }),
    text: [
      `NCOM can send ${input.purpose} mail through ${input.host}.`,
      '',
      `Sent at ${new Date().toUTCString()}.`,
      '',
      'If you received this, the configuration works.',
    ].join('\n'),
  }
}

// ── Buyer-facing ──────────────────────────────────────────────────────────

/**
 * The one message here that goes to a shopper rather than a merchant.
 *
 * It carries the store's name, not just ours: the buyer ordered from a
 * merchant's landing page and may never have heard of NCOM, so the subject and
 * the opening line have to name the shop they actually bought from.
 */
export function orderDispatchedEmail(input: {
  orderNumber: string
  storeName: string
  trackingUrl: string
  courierName: string
}): RenderedEmail {
  return {
    subject: `Order ${input.orderNumber} from ${input.storeName} is on its way`,
    html: renderShell({
      preheader: `${input.courierName} has your parcel. Track it any time with the link inside.`,
      eyebrow: 'Out for delivery',
      heading: 'Your order is with the courier',
      body: [
        lead(
          `Order <strong class="n-strong">${escapeHtml(input.orderNumber)}</strong> from ${escapeHtml(input.storeName)} has been handed to ${escapeHtml(input.courierName)}.`
        ),
        dataTable([
          { label: 'Order', value: input.orderNumber },
          { label: 'Store', value: input.storeName },
          { label: 'Courier', value: input.courierName },
        ]),
        button('Track your delivery', input.trackingUrl),
        fineprint(
          'The tracking page updates itself as the courier reports progress. Keep this link — it stays live until the parcel reaches you.'
        ),
        fallbackLink(input.trackingUrl),
      ].join(''),
      footerNote: `You received this because you placed order ${input.orderNumber} with ${input.storeName}.`,
    }),
    text: [
      `Order ${input.orderNumber} from ${input.storeName} has been handed to ${input.courierName}.`,
      '',
      `Track your delivery: ${input.trackingUrl}`,
      '',
      'The page updates itself as the courier reports progress. Keep this link — it stays live until the parcel reaches you.',
    ].join('\n'),
  }
}
