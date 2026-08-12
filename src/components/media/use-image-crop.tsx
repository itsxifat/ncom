'use client'

import { useCallback, useRef, useState } from 'react'
import { ImageCropper, isCroppable } from '@/components/media/image-cropper'

/**
 * Puts the crop step between choosing a file and uploading it.
 *
 * Every upload in the app is a `<input type="file">` whose change handler
 * calls straight into `uploadMediaFile`. Rather than teach each of those about
 * a dialog, this hands back a promise: `requestCrop(file)` resolves to the file
 * to upload, so a call site becomes
 *
 *     const file = await requestCrop(picked)
 *     if (file) await upload(file)
 *
 * and renders `{cropper}` somewhere in its tree.
 *
 * Resolves to null when cancelled, and passes formats that cannot survive a
 * canvas round-trip (animated GIFs) straight through untouched.
 */
export function useImageCrop() {
  const [pending, setPending] = useState<File | null>(null)
  const resolver = useRef<((file: File | null) => void) | null>(null)

  const settle = useCallback((file: File | null) => {
    resolver.current?.(file)
    resolver.current = null
    setPending(null)
  }, [])

  const requestCrop = useCallback(
    (file: File | undefined): Promise<File | null> => {
      if (!file) return Promise.resolve(null)
      if (!isCroppable(file)) return Promise.resolve(file)

      // A second pick while the dialog is open abandons the first rather than
      // stranding its promise unresolved.
      resolver.current?.(null)

      setPending(file)
      return new Promise<File | null>((resolve) => {
        resolver.current = resolve
      })
    },
    []
  )

  const cropper = pending ? (
    <ImageCropper
      file={pending}
      onCancel={() => settle(null)}
      onDone={(file) => settle(file)}
    />
  ) : null

  return { requestCrop, cropper }
}
