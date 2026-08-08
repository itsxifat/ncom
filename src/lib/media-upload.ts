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

async function presign(
  file: File,
  projectId?: string
): Promise<{
  url: string
  method: string
  headers?: Record<string, string>
  key: string
}> {
  const response = await fetch('/api/media/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      projectId,
    }),
  })
  if (!response.ok) throw new Error(await readJsonError(response))
  return response.json()
}

async function putFile(
  upload: { url: string; method: string; headers?: Record<string, string> },
  file: File
) {
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  })
  if (!response.ok) throw new Error('Upload failed')
}

/** Presigns, uploads, and confirms a new media asset. */
export async function uploadMediaFile(
  file: File,
  opts?: { projectId?: string; altText?: string }
): Promise<MediaAssetDTO> {
  const upload = await presign(file, opts?.projectId)
  await putFile(upload, file)

  const response = await fetch('/api/media/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: upload.key,
      fileName: file.name,
      mimeType: file.type,
      projectId: opts?.projectId,
      altText: opts?.altText,
    }),
  })
  if (!response.ok) throw new Error(await readJsonError(response))
  return response.json()
}

/** Re-processes a fresh file into an existing asset's storage key/URL. */
export async function replaceMediaFile(
  mediaId: string,
  file: File
): Promise<MediaAssetDTO> {
  const upload = await presign(file)
  await putFile(upload, file)

  const response = await fetch(`/api/media/${mediaId}/replace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: upload.key, mimeType: file.type }),
  })
  if (!response.ok) throw new Error(await readJsonError(response))
  return response.json()
}
