'use server'

import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getPageVersionSections,
  listPageVersions,
  type PageVersionSection,
  type PageVersionSummary,
} from '@/server/services/pageVersionService'

/**
 * The History panel's reads. Restoring a version writes nothing here — the
 * builder lays the version over its draft and saves it like any other edit —
 * so both are reads, open to anyone who can open the builder.
 */

export async function listPageVersionsAction(
  storeId: string,
  pageId: string
): Promise<
  { ok: true; versions: PageVersionSummary[] } | { ok: false; error: string }
> {
  const { organization } = await getActiveOrganization()
  try {
    return {
      ok: true,
      versions: await listPageVersions(organization.id, storeId, pageId),
    }
  } catch (cause) {
    console.error('[history] listing versions failed', cause)
    return { ok: false, error: 'Could not load this page’s history.' }
  }
}

export async function getPageVersionAction(
  storeId: string,
  pageId: string,
  versionId: string
): Promise<
  { ok: true; sections: PageVersionSection[] } | { ok: false; error: string }
> {
  const { organization } = await getActiveOrganization()
  try {
    return {
      ok: true,
      sections: await getPageVersionSections(
        organization.id,
        storeId,
        pageId,
        versionId
      ),
    }
  } catch (cause) {
    console.error('[history] opening a version failed', cause)
    return { ok: false, error: 'That version could not be opened.' }
  }
}
