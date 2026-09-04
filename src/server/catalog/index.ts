/**
 * The product source: everything NCOM knows about a merchant's catalogue, read
 * from their own website on demand and never stored here.
 *
 * Start at server/catalog/source.ts. docs/product-source.md is the contract the
 * other end implements, and the reference connectors under connectors/ are
 * working implementations of it.
 */
export * from './types'
export * from './errors'
export {
  loadConnection,
  requireConnection,
  checkConnection,
  normalizeBaseUrl,
  describeFailure,
  type CatalogConnection,
} from './connection'
export {
  getConnectionStatus,
  saveConnection,
  rotateConnectionSecret,
  deleteConnection,
  type ConnectionStatus,
} from './connection-admin'
export type { CatalogTarget } from './client'
export { isSellable } from './rules'
export { CONTRACT_VERSION } from './contract'
export {
  hasCatalogSource,
  splitBySource,
  listProducts,
  listRemoteProducts,
  searchProducts,
  getProduct,
  getProductsByIds,
  resolveVariants,
  getStock,
  listCategories,
  reserveStock,
  releaseStock,
  takeRemoteStock,
  canReserve,
  type VariantRef,
  type ResolvedVariant,
} from './source'
export {
  withStockLock,
  outstandingHolds,
  recordStockHolds,
  releaseStockHolds,
  StockQueueTimeoutError,
  HOLD_TTL_MS,
} from './queue'
