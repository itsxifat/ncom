import Link from 'next/link'
import { redirect } from 'next/navigation'
import { acceptInvitation } from '@/server/services/invitationService'
import { setActiveOrganizationCookie } from '@/server/services/organizationService'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'

/**
 * Invitation acceptance.
 *
 * Acceptance is a state change, so it runs from a form POST rather than on
 * page load: a GET that mutates would be triggered by any link preview, email
 * scanner or prefetch that touches the URL, silently consuming the invite.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: PageProps<'/invitations/accept'>) {
  const query = await searchParams
  const token = typeof query.token === 'string' ? query.token : null
  const error = typeof query.error === 'string' ? query.error : null

  if (!token) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Invitation link is incomplete"
          description="Ask whoever invited you to send the full link again."
        />
      </div>
    )
  }

  async function accept(formData: FormData) {
    'use server'

    const submitted = String(formData.get('token') ?? '')

    try {
      const membership = await acceptInvitation(submitted)
      await setActiveOrganizationCookie(membership.organizationId)
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Could not accept the invitation'
      redirect(
        `/invitations/accept?token=${encodeURIComponent(submitted)}&error=${encodeURIComponent(message)}`
      )
    }

    redirect('/stores')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Join this workspace"
        description="You have been invited to collaborate. Accepting adds this workspace to your account."
      />

      <Card className="max-w-lg">
        <CardContent>
          <form action={accept} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit">Accept invitation</Button>
              <Button
                variant="ghost"
                render={<Link href="/stores" />}
                nativeButton={false}
              >
                Not now
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
