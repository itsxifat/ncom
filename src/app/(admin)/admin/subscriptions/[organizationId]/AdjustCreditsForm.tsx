'use client'

import { useState, useTransition } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { adjustAiCreditsAction } from '../../ai-credits/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field'

/**
 * Giving a workspace credits, or taking some back — goodwill after a failed
 * campaign, a deal agreed on the phone, a correction. The note is shown to
 * the workspace in its credit history, so it is written for them.
 */
export function AdjustCreditsForm({
  organizationId,
}: {
  organizationId: string
}) {
  const [credits, setCredits] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(sign: 1 | -1) {
    const amount = Math.abs(Math.trunc(Number(credits)))
    if (!amount) {
      setError('Enter how many credits.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await adjustAiCreditsAction({
        organizationId,
        credits: sign * amount,
        note,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(
        sign > 0 ? `Added ${amount} credits` : `Removed ${amount} credits`
      )
      setCredits('')
      setNote('')
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          inputMode="numeric"
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          placeholder="Credits"
          aria-label="Credits"
          className="w-28"
        />
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note for the workspace (optional)"
          aria-label="Note"
          maxLength={200}
          className="min-w-48 flex-1"
        />
        <Button type="button" disabled={pending} onClick={() => submit(1)}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => submit(-1)}
        >
          <Minus />
          Remove
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
