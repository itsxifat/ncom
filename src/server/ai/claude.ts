import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { getAiApiKey, getAiConfig } from '@/server/services/aiSettingsService'

/**
 * The one place NCOM talks to Claude.
 *
 * Everything the AI builder does is "write a design from these instructions",
 * so this exposes exactly that: a cached system prompt (the design guide — the
 * same few thousand tokens for every merchant with the same kind of site), one
 * request, and the answer's text. Streaming, because a whole store is a long
 * answer and the merchant is watching a progress line while it arrives.
 *
 * Runs on the platform's own Claude account: the key and the model are set
 * in the admin panel (see aiSettingsService). Without a key the AI builder is
 * simply not offered, and every other way to start a site still works —
 * including pasting a design from the merchant's own AI, which needs no key.
 */

export type AiFailureReason =
  'unavailable' | 'busy' | 'refused' | 'too_long' | 'failed'

/** A failure with a sentence a merchant can read. */
export class AiDesignError extends Error {
  constructor(
    message: string,
    readonly reason: AiFailureReason
  ) {
    super(message)
    this.name = 'AiDesignError'
  }
}

/** One client per key, made again when the admin saves a different one. */
let client: { key: string; api: Anthropic } | null = null

async function anthropic(): Promise<{ api: Anthropic; model: string }> {
  const [key, config] = await Promise.all([getAiApiKey(), getAiConfig()])
  if (!key || !config.enabled) {
    throw new AiDesignError(
      'AI design isn’t available right now. Try again later.',
      'unavailable'
    )
  }
  if (client?.key !== key) {
    client = { key, api: new Anthropic({ apiKey: key, maxRetries: 2 }) }
  }
  return { api: client.api, model: config.model }
}

export type Effort = 'low' | 'medium' | 'high'

export interface DesignRequest {
  /** The design guide. Identical across requests of a kind, so it is cached. */
  system: string
  /** Everything about this one business and this one request. */
  messages: Anthropic.Beta.BetaMessageParam[]
  effort: Effort
  /** Called with each piece of the answer as it arrives. */
  onText?: (text: string) => void
  signal?: AbortSignal
}

export interface DesignAnswer {
  text: string
  /** The full assistant turn, to send back unchanged when asking for a fix. */
  content: Anthropic.Beta.BetaContentBlock[]
}

export async function askClaude(request: DesignRequest): Promise<DesignAnswer> {
  const { api, model } = await anthropic()
  let message: Anthropic.Beta.BetaMessage
  try {
    const stream = api.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        // A declined request is retried server-side on the model Anthropic
        // recommends for that kind of decline, instead of failing the merchant.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: request.effort },
        system: [
          {
            type: 'text',
            text: request.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: request.messages,
      },
      { signal: request.signal }
    )
    if (request.onText) stream.on('text', (delta) => request.onText!(delta))
    message = await stream.finalMessage()
  } catch (cause) {
    throw toDesignError(cause)
  }

  if (message.stop_reason === 'refusal') {
    throw new AiDesignError(
      'The AI could not write this design. Try describing your business differently.',
      'refused'
    )
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiDesignError(
      'The design came out too long. Ask for fewer sections or fewer pages.',
      'too_long'
    )
  }

  const text = message.content
    .filter(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text'
    )
    .map((block) => block.text)
    .join('')
  return { text, content: message.content }
}

function toDesignError(cause: unknown): AiDesignError {
  if (cause instanceof AiDesignError) return cause
  if (cause instanceof Anthropic.APIUserAbortError) {
    return new AiDesignError('Stopped.', 'failed')
  }
  if (cause instanceof Anthropic.AuthenticationError) {
    console.error('[ai] Claude rejected the API key', cause.message)
    return new AiDesignError(
      'AI design isn’t available right now. Try again later.',
      'unavailable'
    )
  }
  if (cause instanceof Anthropic.RateLimitError) {
    return new AiDesignError(
      'The AI builder is busy right now. Try again in a minute.',
      'busy'
    )
  }
  // Checked before APIError, which it extends with no status: a dropped or
  // timed-out connection says nothing about what the merchant asked for.
  if (cause instanceof Anthropic.APIConnectionError) {
    console.error('[ai] Claude could not be reached', cause.message)
    return new AiDesignError(
      'The AI builder could not be reached. Try again in a minute.',
      'busy'
    )
  }
  if (cause instanceof Anthropic.APIError) {
    console.error(
      '[ai] Claude request failed',
      cause.status,
      cause.type,
      cause.message
    )
    // An error partway through a streamed answer has no HTTP status — only
    // its kind, in `type` — and none of those kinds are the merchant's doing.
    const busy =
      cause.type === 'overloaded_error' ||
      cause.type === 'rate_limit_error' ||
      cause.status === 529
    const broken =
      (cause.status !== undefined && cause.status >= 500) ||
      cause.type === 'api_error' ||
      cause.type === 'timeout_error'
    if (busy) {
      return new AiDesignError(
        'The AI builder is busy right now. Try again in a minute.',
        'busy'
      )
    }
    return new AiDesignError(
      broken
        ? 'The AI builder is having a problem. Try again in a minute.'
        : 'The AI builder could not handle that request.',
      broken ? 'busy' : 'failed'
    )
  }
  console.error('[ai] Claude request failed', cause)
  return new AiDesignError(
    'The AI builder could not be reached. Try again in a minute.',
    'failed'
  )
}
