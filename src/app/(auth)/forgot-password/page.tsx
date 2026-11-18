import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = { title: 'Reset your password' }

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<'/forgot-password'>) {
  const { email } = await searchParams
  return (
    <ForgotPasswordForm
      initialEmail={typeof email === 'string' ? email.slice(0, 200) : ''}
    />
  )
}
