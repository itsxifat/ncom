'use client'

import Link from 'next/link'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { AppFrame } from '@/components/app/app-frame'
import { BrandMark } from '@/components/app/brand-mark'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      brand={<BrandMark suffix="Admin" />}
      brandOnLight={<BrandMark suffix="Admin" tone="onLight" />}
      railHeader={
        <div className="bg-lime text-lime-foreground flex items-start gap-2.5 rounded-2xl p-3">
          <ShieldAlert className="mt-px size-4 shrink-0" />
          <p className="text-xs leading-snug font-medium">
            You&apos;re in the platform admin. Actions here affect every tenant.
          </p>
        </div>
      }
      nav={<AdminSidebarNav />}
      railFooter={
        <Link
          href="/dashboard"
          className="text-ink-muted hover:bg-sidebar-accent hover:text-sidebar-foreground flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4.5 shrink-0" />
          Back to workspace
        </Link>
      }
    >
      {children}
    </AppFrame>
  )
}
