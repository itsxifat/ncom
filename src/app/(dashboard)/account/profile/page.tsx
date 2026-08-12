import { requireAuth } from '@/server/auth/rbac'
import { SettingsSection } from '@/components/app/settings-section'
import { ProfileForm } from '@/components/dashboard/profile-form'

export default async function ProfilePage() {
  const session = await requireAuth()

  return (
    <SettingsSection
      title="Profile"
      description="The name teammates see on your workspace activity."
    >
      <ProfileForm
        key={session.user.name}
        name={session.user.name ?? ''}
        email={session.user.email ?? ''}
      />
    </SettingsSection>
  )
}
