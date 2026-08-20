'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CameraOff, Loader2, ScanLine } from 'lucide-react'
import { findScannedOrderAction } from '@/app/(dashboard)/scan/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'

/** A scan that has already been resolved, kept so the session reads as a list. */
interface ScanRecord {
  code: string
  at: string
  outcome: string
  ok: boolean
}

/**
 * Scan a parcel, open its order.
 *
 * Two ways in, because packing tables in this market are equipped both ways: a
 * ৳1,500 laser gun that types the code and presses Enter, and the phone in the
 * packer's other hand. The input is focused and stays focused for the first
 * kind — a gun sends keystrokes to whatever has focus, and a field that loses
 * it silently drops scans into the page.
 *
 * The camera decoder is loaded only when the camera is asked for. It is a few
 * hundred kilobytes of decoder, and a merchant with a gun should never pay for
 * it.
 */
export function OrderScanner({
  stores,
}: {
  stores: { id: string; name: string }[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [code, setCode] = useState('')
  const [storeId, setStoreId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ScanRecord[]>([])
  const [pending, start] = useTransition()

  // A gun scans into whatever has focus. Taking it on mount is the difference
  // between "scan and go" and "click the box first, every time".
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit(raw: string) {
    const value = raw.trim()
    if (!value || pending) return

    start(async () => {
      setError(null)
      const result = await findScannedOrderAction(value, storeId || undefined)
      const at = new Date().toLocaleTimeString()

      if (result.ok) {
        setHistory((current) =>
          [
            {
              code: value,
              at,
              ok: true,
              outcome: `${result.orderNumber}${result.storeName ? ` · ${result.storeName}` : ''}`,
            },
            ...current,
          ].slice(0, 20)
        )
        setCode('')
        router.push(`/orders/${result.orderId}`)
        return
      }

      setError(result.error)
      setHistory((current) =>
        [
          { code: value, at, ok: false, outcome: result.error },
          ...current,
        ].slice(0, 20)
      )
      setCode('')
      inputRef.current?.focus()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit(code)
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <ScanLine className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  ref={inputRef}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Scan a parcel, or type an order number"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="pl-9 font-mono"
                  aria-label="Scanned code"
                />
              </div>

              {/* Which site's parcels this table is packing. Scanning one from
                  another store then reads as a refusal rather than opening an
                  order that belongs in a different pile. */}
              {stores.length > 1 && (
                <FormSelect
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  aria-label="Store"
                  placeholder="Every store"
                  className="w-48"
                >
                  <option value="">Every store</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </FormSelect>
              )}

              <Button type="submit" disabled={pending || !code.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <ScanLine />}
                Open
              </Button>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </form>

          <CameraScanner onScan={submit} busy={pending} />
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              This session
            </h2>
            <ol className="flex flex-col gap-2">
              {history.map((record, index) => (
                <li
                  key={`${record.code}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0"
                >
                  <code className="font-mono">{record.code}</code>
                  <span
                    className={
                      record.ok ? 'text-muted-foreground' : 'text-destructive'
                    }
                  >
                    {record.outcome}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {record.at}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * The phone camera half.
 *
 * ZXing is imported inside the click handler rather than at the top of the
 * file: it is the largest thing on this page by an order of magnitude and most
 * scans in a warehouse come off a gun, so the merchants who never open the
 * camera never download the decoder.
 *
 * Every scan stops the camera. A viewfinder that keeps decoding while the page
 * navigates away fires the same order three more times and leaves the torch on.
 */
function CameraScanner({
  onScan,
  busy,
}: {
  onScan: (code: string) => void
  busy: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Whatever happens — a navigation, a re-render, a closed tab — the camera
  // has to be released. A torch left on is how a phone gets unplugged in the
  // middle of a packing run.
  useEffect(() => () => stopRef.current?.(), [])

  async function open() {
    setError(null)
    setStarting(true)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (result) => {
          if (!result) return
          stop()
          onScan(result.getText())
        }
      )

      stopRef.current = () => {
        controls.stop()
        stopRef.current = null
      }
      setActive(true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? // The usual one, said in the merchant's terms rather than the
            // browser's: permission refused, or no camera on a desktop.
            /permission|denied|notallowed/i.test(cause.name + cause.message)
            ? 'The browser blocked the camera. Allow camera access for this site and try again.'
            : cause.message
          : 'Could not start the camera'
      )
    } finally {
      setStarting(false)
    }
  }

  function stop() {
    stopRef.current?.()
    setActive(false)
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={starting || busy}
          onClick={() => (active ? stop() : open())}
        >
          {starting ? (
            <Loader2 className="animate-spin" />
          ) : active ? (
            <CameraOff />
          ) : (
            <Camera />
          )}
          {active ? 'Stop camera' : 'Use camera'}
        </Button>
        <p className="text-muted-foreground text-sm text-pretty">
          For a phone with no scanner gun. Point it at the barcode on the
          sticker — it reads the same CODE 128 the labels print, and QR codes
          too.
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Kept mounted whether or not the camera is running: ZXing attaches to
          this element, and an element that appears in the same tick as the
          request is sometimes not there yet when it looks. */}
      <video
        ref={videoRef}
        className={`w-full max-w-md rounded-lg border bg-black ${active ? '' : 'hidden'}`}
        muted
        playsInline
      />
    </div>
  )
}
