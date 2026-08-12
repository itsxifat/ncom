import Link from 'next/link'
import { Boxes } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listInventory } from '@/server/services/inventoryService'
import { listLocations } from '@/server/services/shippingService'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InventoryAdjust } from '@/components/store/inventory-adjust'

export default async function InventoryPage({
  params,
  searchParams,
}: PageProps<'/inventory'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const lowStockOnly = query.low === '1'

  const { organization } = await getActiveOrganization()
  const [{ items }, locations] = await Promise.all([
    listInventory(organization.id, { search, lowStockOnly }),
    listLocations(organization.id),
  ])

  const locationOptions = locations.map((location) => ({
    id: location.id,
    name: location.name,
  }))

  if (items.length === 0 && !search && !lowStockOnly) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nothing tracked yet"
        description="Variants with inventory tracking switched on appear here so you can receive and adjust stock."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-center gap-3">
        <Input
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search product"
          className="w-full sm:w-72"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="low"
            value="1"
            defaultChecked={lowStockOnly}
            className="size-4"
          />
          Low stock only
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={Boxes} title="Nothing matches" />
      ) : (
        <ListPanel>
          <ListPanelHeader>
            <p className="text-muted-foreground text-sm">
              {items.length} tracked{' '}
              {items.length === 1 ? 'variant' : 'variants'}
            </p>
          </ListPanelHeader>

          {items.map((variant) => (
            <ListRow key={variant.id}>
              <ListRowText
                title={
                  <Link
                    href={`/products/${variant.product.id}`}
                    className="hover:underline"
                  >
                    {variant.product.title}
                  </Link>
                }
                meta={
                  <>
                    {variant.title !== 'Default Title' && `${variant.title} · `}
                    {variant.sku ? `SKU ${variant.sku} · ` : ''}
                    {variant.totalAvailable} available
                    {variant.totalCommitted > 0 &&
                      ` · ${variant.totalCommitted} committed to orders`}
                  </>
                }
                badges={
                  variant.totalAvailable <= 0 ? (
                    <Badge variant="destructive">
                      {variant.inventoryPolicy === 'CONTINUE'
                        ? 'Backorder'
                        : 'Out of stock'}
                    </Badge>
                  ) : variant.totalAvailable <= 5 ? (
                    <Badge variant="secondary">Low</Badge>
                  ) : undefined
                }
              />
              <ListRowActions>
                <InventoryAdjust
                  variantId={variant.id}
                  locations={locationOptions}
                />
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
