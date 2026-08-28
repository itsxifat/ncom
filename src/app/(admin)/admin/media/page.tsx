import { Image as ImageIcon } from 'lucide-react'
import {
  listAllMediaAssets,
  getStorageUsage,
} from '@/server/services/adminService'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { StatCard } from '@/components/app/stat-card'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function AdminMediaPage() {
  const [assets, usage] = await Promise.all([
    listAllMediaAssets(),
    getStorageUsage(),
  ])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Content"
        title="Media"
        description="Every image uploaded by every tenant."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:max-w-2xl">
        <StatCard label="Assets" value={usage.assetCount} />
        <StatCard
          tone="ink"
          label="Storage used"
          value={formatBytes(usage.totalBytes)}
        />
      </div>

      {assets.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media uploaded yet"
          description="Images tenants upload to their libraries show up here."
        />
      ) : (
        <div className="3xl:grid-cols-9 4xl:grid-cols-11 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
          {assets.map((asset) => (
            <Card key={asset.id} size="sm" className="gap-2.5 pt-0">
              <div className="bg-muted aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary CDN-hosted URLs */}
                <img
                  src={asset.url}
                  alt={asset.altText ?? ''}
                  className="size-full object-cover"
                />
              </div>
              <CardContent>
                <p
                  className="truncate text-xs font-medium"
                  title={asset.fileName}
                >
                  {asset.fileName}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {asset.organization.name} · {formatBytes(asset.sizeBytes)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
