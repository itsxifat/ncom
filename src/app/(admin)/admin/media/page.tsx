import {
  listAllMediaAssets,
  getStorageUsage,
} from '@/server/services/adminService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Media
        </h1>
        <p className="text-muted-foreground mt-1">
          {usage.assetCount} assets · {formatBytes(usage.totalBytes)} total
          across every tenant.
        </p>
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No media uploaded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <div className="bg-muted aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary local-driver/S3 URLs */}
                <img
                  src={asset.url}
                  alt={asset.altText ?? ''}
                  className="size-full object-cover"
                />
              </div>
              <CardHeader className="p-2">
                <CardTitle
                  className="truncate text-xs font-medium"
                  title={asset.fileName}
                >
                  {asset.fileName}
                </CardTitle>
                <p className="text-muted-foreground truncate text-xs">
                  {asset.organization.name} · {formatBytes(asset.sizeBytes)}
                </p>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
