import { SettingsSection } from '@/components/app/settings-section'
import { PasswordForm } from '@/components/dashboard/password-form'

export default function SecurityPage() {
  return (
    <SettingsSection
      title="Password"
      description="Choose a password you don't use anywhere else."
    >
      <PasswordForm />
    </SettingsSection>
  )
}
