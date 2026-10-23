'use server'

import { getActiveOrganization } from '@/server/services/organizationService'
import { AuthorizationError } from '@/server/auth/rbac'
import {
  createSavedBlock,
  deleteSavedBlock,
  getSavedBlock,
  listSavedBlocks,
  renameSavedBlock,
  SavedBlockError,
  type SavedBlockCopy,
  type SavedBlockSummary,
} from '@/server/services/savedBlockService'

/**
 * The saved-block library, for the builder.
 *
 * Organisation-wide like the media library, so it works the same from every
 * site's builder. Failures come back as values: each is called from a dialog
 * or a menu that has somewhere to say what went wrong, and a rejected server
 * action would surface as the generic error overlay instead. The workspace is
 * looked up outside the `try`, because it redirects a signed-out visitor and a
 * redirect is thrown — caught here, it would be reported as a failed save.
 */

type Failure = { ok: false; error: string }

function failure(cause: unknown, fallback: string): Failure {
  if (cause instanceof SavedBlockError)
    return { ok: false, error: cause.message }
  if (cause instanceof AuthorizationError) {
    return {
      ok: false,
      error: 'You can look at this workspace’s sites but not change them.',
    }
  }
  console.error('[saved blocks]', cause)
  return { ok: false, error: fallback }
}

export async function listSavedBlocksAction(): Promise<
  { ok: true; blocks: SavedBlockSummary[] } | Failure
> {
  const { organization } = await getActiveOrganization()
  try {
    return { ok: true, blocks: await listSavedBlocks(organization.id) }
  } catch (cause) {
    return failure(cause, 'Could not load your saved blocks.')
  }
}

export async function getSavedBlockAction(
  id: string
): Promise<{ ok: true; block: SavedBlockCopy } | Failure> {
  const { organization } = await getActiveOrganization()
  try {
    return { ok: true, block: await getSavedBlock(organization.id, id) }
  } catch (cause) {
    return failure(cause, 'Could not add that block.')
  }
}

export async function saveBlockAction(input: {
  name: string
  type: string
  content: unknown
  config: unknown
}): Promise<{ ok: true; block: SavedBlockSummary } | Failure> {
  const { organization } = await getActiveOrganization()
  try {
    return { ok: true, block: await createSavedBlock(organization.id, input) }
  } catch (cause) {
    return failure(cause, 'Could not save the block.')
  }
}

export async function renameSavedBlockAction(
  id: string,
  name: string
): Promise<{ ok: true } | Failure> {
  const { organization } = await getActiveOrganization()
  try {
    await renameSavedBlock(organization.id, id, name)
    return { ok: true }
  } catch (cause) {
    return failure(cause, 'Could not rename the block.')
  }
}

export async function deleteSavedBlockAction(
  id: string
): Promise<{ ok: true } | Failure> {
  const { organization } = await getActiveOrganization()
  try {
    await deleteSavedBlock(organization.id, id)
    return { ok: true }
  } catch (cause) {
    return failure(cause, 'Could not delete the block.')
  }
}
