export interface MediaAssetDTO {
  id: string
  url: string
  fileName: string
  mimeType: string
  width: number | null
  height: number | null
  altText: string | null
}

async function readJsonError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    return body?.error ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

/**
 * The file is posted to our own server, which re-encodes it and forwards
 * it to the CDN — the CDN's credentials are server-side only, so there is
 * no browser-direct upload step to presign.
 */
async function postFile(
  url: string,
  file: File,
  fields?: Record<string, string | undefined>
): Promise<MediaAssetDTO> {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== undefined) form.append(key, value)
  }

  const response = await fetch(url, { method: 'POST', body: form })
  if (!response.ok) throw new Error(await readJsonError(response))
  return response.json()
}

/** Uploads a new media asset and returns the created record. */
export async function uploadMediaFile(
  file: File,
  opts?: { storeId?: string; altText?: string }
): Promise<MediaAssetDTO> {
  return postFile('/api/media/upload', file, {
    storeId: opts?.storeId,
    altText: opts?.altText,
  })
}

/** Swaps the file behind an existing asset, repointing anything using it. */
export async function replaceMediaFile(
  mediaId: string,
  file: File
): Promise<MediaAssetDTO> {
  return postFile(`/api/media/${mediaId}/replace`, file)
}
