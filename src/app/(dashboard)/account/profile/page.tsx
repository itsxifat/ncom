import { requireAuth } from '@/server/auth/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProfileForm } from '@/components/dashboard/profile-form'

export default async function ProfilePage() {
  const session = await requireAuth()

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Account settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            key={session.user.name}
            name={session.user.name ?? ''}
            email={session.user.email ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  )
}
