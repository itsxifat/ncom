import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { OrgRole } from '@/generated/prisma/enums'

/**
 * Who is acting on this request, when it is not a signed-in person.
 *
 * The service layer is written around `requireOrgAccess`, which asks "does the
 * current *user* belong to this organisation". An API key has no user, so
 * without something like this every service would need a second, key-shaped
 * entry point — and the two would drift, which is exactly how one path ends up
 * missing a tenant filter the other has.
 *
 * Instead the API boundary announces a machine actor for the duration of the
 * request and `requireOrgAccess` consults it. AsyncLocalStorage is what makes
 * that safe under concurrency: each request gets its own store, so two requests
 * for different organisations cannot see each other's actor no matter how they
 * interleave.
 */

export interface MachineActor {
  kind: 'apiKey'
  apiKeyId: string
  keyName: string
  organizationId: string
  /**
   * The org role the key acts with.
   *
   * ADMIN rather than something finer, because the real authorisation for a key
   * is its *scopes*, which are checked once at the route boundary and are more
   * specific than org roles are (`PRODUCTS_READ` has no membership equivalent).
   * Org roles exist to describe what a colleague may do; re-deriving one here
   * would mean two authorisation systems disagreeing about the same request.
   *
   * The rule this depends on: every `/api/v1` route declares a scope, and no
   * route exposes an operation that scopes do not cover — in particular nothing
   * that manages members, billing or other API keys.
   */
  role: OrgRole
}

const storage = new AsyncLocalStorage<MachineActor>()

export function runAsMachine<T>(
  actor: MachineActor,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(actor, fn)
}

export function currentMachineActor(): MachineActor | undefined {
  return storage.getStore()
}
