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
  getConnectionStatus,
  saveConnection,
  rotateConnectionSecret,
  deleteConnection,
  normalizeBaseUrl,
  describeFailure,
  type CatalogConnection,
  type ConnectionStatus,
} from './connection'
export { checkConnection } from './connection'
export type { CatalogTarget } from './client'
export { isSellable } from './rules'
export { CONTRACT_VERSION } from './contract'
export {
  hasCatalogSource,
  listProducts,
  searchProducts,
  getProduct,
  getProductsByIds,
  resolveVariants,
  getStock,
  listCategories,
  reserveStock,
  releaseStock,
  canReserve,
  type VariantRef,
  type ResolvedVariant,
} from './source'
