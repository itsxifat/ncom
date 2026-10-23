'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

/**
 * Copies the "use your own AI" prompt to the clipboard.
 *
 * The prompt is built on the server — it is the design guide plus this shop's
 * facts — and fetched only when asked for. When the browser will not let a page
 * write to the clipboard (some do not, outside a secure context), the prompt is
 * shown in a box to copy by hand rather than the button silently doing nothing.
 */
export function CopyPromptButton({
  getPrompt,
  label = 'Copy the prompt',
  size = 'default',
  className,
}: {
  getPrompt: () => Promise<string>
  label?: string
  size?: 'default' | 'sm' | 'lg'
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState<string | null>(null)

  function copy() {
    startTransition(async () => {
      let prompt: string
      try {
        prompt = await getPrompt()
      } catch {
        toast.error('Could not make the prompt. Try again.')
        return
      }
      try {
        await navigator.clipboard.writeText(prompt)
        setCopied(true)
        toast.success('Copied — now paste it into your AI')
        window.setTimeout(() => setCopied(false), 4000)
      } catch {
        setManual(prompt)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={copy}
        disabled={pending}
        className={className}
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : copied ? (
          <Check />
        ) : (
          <Copy />
        )}
        {copied ? 'Copied' : label}
      </Button>
      <Dialog
        open={manual !== null}
        onOpenChange={(open) => !open && setManual(null)}
      >
        <DialogContent className="flex max-h-[85svh] flex-col gap-3 sm:max-w-2xl">
          <DialogTitle>Copy this prompt</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Your browser didn’t let us copy it for you. Select all of the text
            below, copy it, and paste it into your AI.
          </p>
          <Textarea
            readOnly
            value={manual ?? ''}
            onFocus={(event) => event.currentTarget.select()}
            className="[field-sizing:fixed] min-h-0 flex-1 font-mono text-xs"
            rows={16}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
