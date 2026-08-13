'use client'

import { useState, useTransition } from 'react'
import { Loader2, Search } from 'lucide-react'
import { checkPhoneAction } from '@/app/(dashboard)/courier-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FraudVerdictBadge, FraudStats } from './fraud-badges'

/**
 * Look up a phone number by hand.
 *
 * Merchants take orders over the phone and on Facebook, outside any checkout
 * this platform can see, and the question "is this number safe to ship to" is
 * the same question either way. Always runs a fresh lookup rather than reading
 * the cache: someone typing a number into a box wants today's answer.
 */
export function FraudLookup() {
  const [phone, setPhone] = useState('')
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof checkPhoneAction>
  > | null>(null)

  const run = () => {
    if (!phone.trim()) return
    start(async () => setResult(await checkPhoneAction(phone)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              run()
            }
          }}
          placeholder="01712345678"
          inputMode="tel"
          className="max-w-xs"
          aria-label="Customer phone number"
        />
        <Button type="button" onClick={run} disabled={pending || !phone.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />}
          Check
        </Button>
      </div>

      {result && !result.ok && (
        <p className="text-destructive text-sm">{result.error}</p>
      )}

      {result?.ok && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FraudVerdictBadge verdict={result.assessment.verdict} />
            <span className="text-muted-foreground text-sm">
              {result.assessment.phone}
            </span>
          </div>

          <p className="text-sm text-pretty">{result.assessment.reason}</p>

          <FraudStats
            delivered={result.assessment.delivered}
            cancelled={result.assessment.cancelled}
            frauds={result.assessment.frauds}
            successRateBps={result.assessment.successRateBps}
          />
        </div>
      )}
    </div>
  )
}
