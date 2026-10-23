import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getSettingsOverview,
  type SettingStatus,
} from '@/server/services/settingsOverviewService'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/app/page-header'
import { SETTINGS_GROUPS } from '@/components/dashboard/settings-entries'

/**
 * Everything set up once, on one page.
 *
 * Twelve of these used to be entries in the rail beside Orders and Products,
 * where a merchant met "Locations" and "Webhooks" every time they went to pack
 * a parcel. Here they are a list a merchant comes to on purpose, grouped by the
 * job, each row saying what it does and what state it is in — so "is my
 * courier connected" is answered by reading the row, not by opening it.
 */
export default async function SettingsPage() {
  const { organization } = await getActiveOrganization()
  const overview = await getSettingsOverview(organization.id)

  return (
    <>
      <PageHeader
        title="Settings"
        description="Set these up once. You can come back and change them any time."
      />

      {SETTINGS_GROUPS.map((group) => (
        <section
          key={group.title}
          aria-labelledby={`settings-${group.title}`}
          className="flex flex-col gap-2.5"
        >
          <h2
            id={`settings-${group.title}`}
            className="text-muted-foreground px-1 text-sm font-semibold"
          >
            {group.title}
          </h2>
          <div className="bg-card ring-border divide-border/70 flex flex-col divide-y overflow-hidden rounded-xl ring-1">
            {group.entries.map((entry) => {
              const Icon = entry.icon
              const status = overview[entry.href]

              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="hover:bg-muted/50 flex min-h-17 items-center gap-4 px-4 py-3 transition-colors sm:px-5"
                >
                  <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{entry.title}</span>
                    <span className="text-muted-foreground block text-sm">
                      {entry.description}
                    </span>
                  </span>
                  {status && <Status status={status} />}
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

function Status({ status }: { status: SettingStatus }) {
  return (
    <span
      className={cn(
        'hidden shrink-0 items-center gap-2 text-sm sm:inline-flex',
        status.tone === 'ok' &&
          'font-semibold text-emerald-800 dark:text-emerald-300',
        status.tone === 'todo' &&
          'font-semibold text-amber-900 dark:text-amber-300',
        status.tone === 'plain' && 'text-muted-foreground'
      )}
    >
      {status.tone !== 'plain' && (
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            status.tone === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'
          )}
        />
      )}
      {status.text}
    </span>
  )
}
