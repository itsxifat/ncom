'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Talks to `POST /api/ai/design`, which answers one JSON object per line:
 * progress while Claude writes, then the result or an error.
 */

export type AiDesignState =
  | { status: 'idle' }
  | { status: 'running'; sections: number }
  | { status: 'error'; message: string }
  | { status: 'done' }

export function useAiDesign<Done extends object>() {
  const [state, setState] = useState<AiDesignState>({ status: 'idle' })
  const controller = useRef<AbortController | null>(null)

  // Leaving the screen stops the request, and a stopped request's credits are
  // given back, so a merchant who walks away is not charged for a design
  // nobody will see. Hiding is not leaving: a screen that can be put away
  // while a request runs — the builder's AI panel, the wizard's AI tab — stays
  // mounted and hidden, or a glance at another panel would throw away a
  // design that was nearly done.
  useEffect(() => () => controller.current?.abort(), [])

  const run = useCallback(async (body: object): Promise<Done | null> => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setState({ status: 'running', sections: 0 })

    try {
      const response = await fetch('/api/ai/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal,
      })
      if (!response.ok || !response.body) {
        const error = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        setState({
          status: 'error',
          message: error?.error ?? 'The AI builder could not start. Try again.',
        })
        return null
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
          if (!line) continue
          const event = JSON.parse(line) as {
            type: string
            sections?: number
            message?: string
          }
          if (event.type === 'progress') {
            setState({ status: 'running', sections: event.sections ?? 0 })
          } else if (event.type === 'error') {
            setState({
              status: 'error',
              message: event.message ?? 'Something went wrong.',
            })
            return null
          } else if (event.type === 'done') {
            setState({ status: 'done' })
            return event as unknown as Done
          }
        }
      }
      setState({
        status: 'error',
        message:
          'The connection closed before the design was finished. Try again.',
      })
      return null
    } catch (cause) {
      if (abort.signal.aborted) {
        setState({ status: 'idle' })
        return null
      }
      setState({
        status: 'error',
        message:
          cause instanceof Error && cause.message
            ? 'The connection to the AI builder dropped. Try again.'
            : 'Something went wrong.',
      })
      return null
    }
  }, [])

  const cancel = useCallback(() => {
    controller.current?.abort()
    setState({ status: 'idle' })
  }, [])

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, run, cancel, reset }
}

/** The progress line under the spinner. */
export function progressLabel(
  sections: number,
  what: 'site' | 'page' | 'section'
) {
  if (what === 'section') return 'Rewriting…'
  if (sections <= 0) return 'Thinking about your business…'
  return `Designing section ${sections}…`
}
