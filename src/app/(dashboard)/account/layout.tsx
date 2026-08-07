import Link from 'next/link'

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-lg gap-4 border-b pb-2 text-sm">
        <Link
          href="/account/profile"
          className="hover:text-foreground text-muted-foreground"
        >
          Profile
        </Link>
        <Link
          href="/account/security"
          className="hover:text-foreground text-muted-foreground"
        >
          Security
        </Link>
      </div>
      {children}
    </div>
  )
}
