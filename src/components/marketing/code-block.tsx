'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * A copyable code sample.
 *
 * Documentation code is meant to be taken, not read: anyone following these
 * pages is going to paste every one of these blocks into a terminal or an
 * editor, and selecting twenty lines of JSON with a mouse is where they
 * introduce the truncation that makes the example "not work".
 *
 * The copy button lives outside the scroll container so it stays reachable on a
 * block that scrolls sideways, which every curl example does on a phone.
 */
export function CodeBlock({
  code,
  language,
  title,
}: {
  code: string
  language?: string
  title?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // The code is still selectable, so this is not worth an error state.
    }
  }

  return (
    <figure className="border-border/60 bg-ink my-4 overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <figcaption className="min-w-0 truncate font-mono text-xs text-white/50">
          {title ?? language ?? 'code'}
        </figcaption>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <pre className="p-4 text-[13px] leading-relaxed text-white/90">
          <code>{code}</code>
        </pre>
      </div>
    </figure>
  )
}
