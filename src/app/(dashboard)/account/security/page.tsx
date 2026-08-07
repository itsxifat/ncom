import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordForm } from '@/components/dashboard/password-form'

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display mb-6 text-3xl font-semibold tracking-tight">
        Security
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
