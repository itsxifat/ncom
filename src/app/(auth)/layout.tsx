import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Link
        href="/"
        className="font-display mb-8 text-lg font-semibold tracking-tight"
      >
        NCOM
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
