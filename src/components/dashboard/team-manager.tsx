'use client'

import { useActionState, useState, useTransition } from 'react'
import { Copy, Mail, Trash2 } from 'lucide-react'
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
  type OrgActionState,
} from '@/app/(dashboard)/organization/actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FormSelect } from '@/components/store/form-controls'
import { SettingsSection } from '@/components/app/settings-section'

/**
 * What each role can do, stated in the UI rather than buried in docs.
 *
 * People assigning permissions guess wrong when the only label is a noun, and
 * the guess that costs money is handing out ADMIN because "editor" sounded too
 * limited.
 */
const ROLES = [
  {
    value: 'VIEWER',
    label: 'Viewer',
    blurb: 'Can look at orders, products and pages. Cannot change anything.',
  },
  {
    value: 'EDITOR',
    label: 'Editor',
    blurb:
      'Can manage products, pages, orders and fulfilment. Cannot change billing, payments or people.',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    blurb:
      'Everything an editor can do, plus payment settings, refunds and inviting people.',
  },
  {
    value: 'OWNER',
    label: 'Owner',
    blurb: 'Full control, including deleting stores and the workspace itself.',
  },
] as const

export interface MemberView {
  userId: string
  name: string | null
  email: string
  role: string
  isYou: boolean
}

export interface InvitationView {
  id: string
  email: string
  role: string
  expiresAt: string
}

export function TeamManager({
  members,
  invitations,
  canManage,
}: {
  members: MemberView[]
  invitations: InvitationView[]
  canManage: boolean
}) {
  const [inviteState, inviteAction, inviting] = useActionState<
    OrgActionState,
    FormData
  >(inviteMemberAction, undefined)
  const [busy, startTransition] = useTransition()
  const [result, setResult] = useState<OrgActionState>(undefined)
  const [copied, setCopied] = useState(false)

  return (
    <>
      <SettingsSection
        title="People"
        description="Who can work on this workspace, and what they are allowed to do."
      >
        <div className="flex flex-col gap-4">
          <div className="divide-border/60 flex flex-col divide-y">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {member.name ?? member.email}
                    {member.isYou && (
                      <Badge variant="secondary" className="ml-2">
                        You
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {member.email}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canManage && !member.isYou ? (
                    <FormSelect
                      aria-label={`Role for ${member.email}`}
                      value={member.role}
                      disabled={busy}
                      onChange={(event) =>
                        startTransition(async () => {
                          setResult(
                            await updateMemberRoleAction(
                              member.userId,
                              event.target.value
                            )
                          )
                        })
                      }
                      className="h-9 text-xs"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </FormSelect>
                  ) : (
                    <Badge variant="outline">
                      {ROLES.find((role) => role.value === member.role)
                        ?.label ?? member.role}
                    </Badge>
                  )}

                  {canManage && !member.isYou && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${member.email}`}
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          setResult(await removeMemberAction(member.userId))
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {result?.error && <FieldError>{result.error}</FieldError>}
          {result?.success && (
            <p className="text-muted-foreground text-sm">{result.success}</p>
          )}

          <dl className="text-muted-foreground grid gap-2 border-t pt-4 text-xs">
            {ROLES.map((role) => (
              <div key={role.value}>
                <dt className="text-foreground inline font-medium">
                  {role.label}:{' '}
                </dt>
                <dd className="inline">{role.blurb}</dd>
              </div>
            ))}
          </dl>
        </div>
      </SettingsSection>

      {canManage && (
        <SettingsSection
          title="Invite someone"
          description="They will need to sign in with this exact email address to accept."
        >
          <Card>
            <CardContent>
              <form action={inviteAction}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                    <Input
                      id="invite-email"
                      name="email"
                      type="email"
                      placeholder="teammate@example.com"
                      required
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                    <FormSelect
                      id="invite-role"
                      name="role"
                      defaultValue="EDITOR"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </FormSelect>
                    <FieldDescription>
                      You cannot grant a role higher than your own.
                    </FieldDescription>
                  </Field>

                  {inviteState?.error && (
                    <FieldError>{inviteState.error}</FieldError>
                  )}

                  {inviteState?.inviteUrl && (
                    <Field>
                      <FieldLabel>Invitation link</FieldLabel>
                      {/* Shown because there is no transactional email yet —
                          without this the invite would be created and then be
                          unreachable. */}
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={inviteState.inviteUrl}
                          className="font-mono text-xs"
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              inviteState.inviteUrl ?? ''
                            )
                            setCopied(true)
                          }}
                        >
                          <Copy />
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                      <FieldDescription>
                        Send this to them yourself — automatic invitation emails
                        are not set up yet. The link expires in 14 days.
                      </FieldDescription>
                    </Field>
                  )}

                  <Field>
                    <Button type="submit" disabled={inviting}>
                      <Mail />
                      {inviting ? 'Creating…' : 'Create invitation'}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </SettingsSection>
      )}

      {canManage && invitations.length > 0 && (
        <SettingsSection
          title="Pending invitations"
          description="Not yet accepted."
        >
          <div className="divide-border/60 flex flex-col divide-y">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-muted-foreground text-sm">
                    {
                      ROLES.find((role) => role.value === invitation.role)
                        ?.label
                    }{' '}
                    · expires {invitation.expiresAt}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      setResult(await revokeInvitationAction(invitation.id))
                    })
                  }
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </SettingsSection>
      )}
    </>
  )
}
