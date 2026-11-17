import 'server-only'
import { listSelectablePlans } from '@/server/services/planCheckoutService'
import { toPublicPackage, type PublicPackage } from './packages'

/** The public packages, in order, straight from /admin/plans. */
export async function loadPackages(): Promise<PublicPackage[]> {
  const plans = await listSelectablePlans()
  return plans.map((plan) => toPublicPackage(plan))
}
