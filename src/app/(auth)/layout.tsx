import Link from 'next/link'
import { BrandMark } from '@/components/app/brand-mark'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-canvas flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-8">
        <BrandMark tone="onLight" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
