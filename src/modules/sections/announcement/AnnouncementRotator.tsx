'use client'

import { useEffect, useState } from 'react'
import { El } from '../elements'
import { cn } from '@/lib/utils'

export interface AnnouncementMessage {
  /** Where this message sits in `content.messages`, so canvas edits land on it. */
  index: number
  html: string
  /** Already resolved and checked by the block. Null for plain text. */
  href: string | null
}

/**
 * Below this, a message is gone before anyone has read it. A merchant who sets
 * one second meant "quickly", not "unreadably".
 */
const SHORTEST_SECONDS = 2

/**
 * Takes turns between the bar's messages.
 *
 * Every message is drawn, stacked in one grid cell, and only the current one
 * is visible — so the bar is always as tall as its longest message and the
 * page under it never jumps when the text changes. Hovering or focusing the
 * bar holds the current message, because a link that changes under the cursor
 * just as someone reaches for it is a link nobody can click. Visitors who ask
 * their device for less motion still get the messages in turn, just without
 * the fade.
 */
export function AnnouncementRotator({
  messages,
  seconds,
}: {
  messages: AnnouncementMessage[]
  seconds: number
}) {
  const [current, setCurrent] = useState(0)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held || messages.length < 2) return
    const timer = window.setInterval(
      () => setCurrent((value) => (value + 1) % messages.length),
      Math.max(SHORTEST_SECONDS, seconds) * 1000
    )
    return () => window.clearInterval(timer)
  }, [held, seconds, messages.length])

  const active = current % messages.length

  return (
    <div
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="grid"
    >
      {messages.map((message, position) => (
        <El
          key={message.index}
          as={message.href ? 'a' : 'span'}
          part="message"
          index={message.index}
          href={message.href ?? undefined}
          html={message.html}
          className={cn(
            '[grid-area:1/1] motion-safe:transition-[opacity,visibility] motion-safe:duration-500',
            position === active ? 'opacity-100' : 'invisible opacity-0',
            message.href && 'underline-offset-4 hover:underline'
          )}
        />
      ))}
    </div>
  )
}
