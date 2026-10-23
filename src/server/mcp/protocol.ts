import 'server-only'
import type { RateLimitResult } from '@/lib/rate-limit'
import { MCP_TOOLS, ToolError, type ToolContext } from './tools'

/**
 * The Model Context Protocol, as much of it as NCOM serves.
 *
 * MCP is JSON-RPC 2.0. Over the Streamable HTTP transport a client POSTs one
 * message (or, in the 2025-03-26 revision, a batch), and a server that has
 * nothing to stream may answer with plain JSON — which is all NCOM needs: every
 * tool here finishes in one response, so there are no sessions to keep, no
 * server-sent events and nothing to resume. That keeps the server stateless,
 * which is what lets it run behind any number of app instances.
 *
 * Supported: initialize, ping, tools/list, tools/call, and the notifications a
 * client sends (acknowledged and ignored). Anything else is "method not found",
 * which every client handles.
 */

const SUPPORTED_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]
const LATEST_VERSION = SUPPORTED_VERSIONS[0]!

export const SERVER_INSTRUCTIONS = [
  'NCOM is a website builder for online sellers in Bangladesh: one-page landing pages with a cash-on-delivery order form, and full online stores.',
  'Workflow: list_sites to see the workspace; get_design_guide (kind LANDING or STORE) before writing any design; list_catalog for real category and product ids.',
  'Build with create_site (a new site from a design), get_page then update_page (change a page — keep section ids), update_section, create_page (store pages), update_layout (store header/footer) and update_site_theme.',
  'Everything you write is a draft. Never claim a site is live: give the owner the builderUrl so they can review it and press Publish themselves.',
  'Designs are repaired, not rejected: each tool returns notes on what it fixed or left out — read them and resend a corrected design when needed.',
].join('\n')

type JsonRpcId = string | number | null

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: '2.0'
      id: JsonRpcId
      error: { code: number; message: string; data?: unknown }
    }

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** Not JSON-RPC's own: what NCOM answers when a key goes over its limit. */
  rateLimited: -32029,
} as const

/** What a message is handled with: the tools' context, plus the key's budget. */
export interface McpContext extends ToolContext {
  /**
   * Charges one change against the key's write budget. Every write tool call
   * pays here, one by one, so a key cannot get more changes a minute out of
   * MCP — batched or not — than the REST API would give it.
   */
  chargeWrite: () => Promise<RateLimitResult>
}

function failure(
  id: JsonRpcId,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function isId(value: unknown): value is JsonRpcId {
  return (
    typeof value === 'string' || typeof value === 'number' || value === null
  )
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isRequest(value: unknown): value is JsonRpcRequest {
  const message = asObject(value)
  return (
    message !== null &&
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    (message.id === undefined || isId(message.id))
  )
}

/**
 * A reply from the client — to a request this server never sends, so there is
 * nothing to do with it. Only a real one counts: an id and a result or an
 * error. Something like `{}` is not a message at all, and is told so rather
 * than quietly accepted.
 */
function isResponse(value: unknown): boolean {
  const message = asObject(value)
  return (
    message !== null &&
    message.jsonrpc === '2.0' &&
    !('method' in message) &&
    isId(message.id) &&
    ('result' in message || 'error' in message)
  )
}

/** The id to answer a malformed message with: its own, when it has a usable one. */
function idOf(value: unknown): JsonRpcId {
  const id = asObject(value)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

const NOT_A_REQUEST = 'Not a JSON-RPC 2.0 request.'

/**
 * Turns a message away without running it — past the batch cap, or over the
 * key's limit. Anything that expects an answer gets this error under its own
 * id, because a client waits on every id it sent; a notification or a
 * response gets nothing, as it would have anyway.
 */
export function refuseMessage(
  message: unknown,
  code: number,
  text: string
): JsonRpcResponse | null {
  if (isRequest(message)) {
    return message.id === undefined ? null : failure(message.id, code, text)
  }
  if (isResponse(message)) return null
  return failure(idOf(message), RPC_ERRORS.invalidRequest, NOT_A_REQUEST)
}

/** Answers one message; null for a notification or a response, which get none. */
export async function handleMessage(
  message: unknown,
  context: McpContext
): Promise<JsonRpcResponse | null> {
  if (!isRequest(message)) {
    if (isResponse(message)) return null
    return failure(idOf(message), RPC_ERRORS.invalidRequest, NOT_A_REQUEST)
  }

  const isNotification = message.id === undefined
  const id = message.id ?? null
  const params = message.params ?? {}

  if (isNotification) return null

  switch (message.method) {
    case 'initialize': {
      const requested =
        typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested)
            ? requested
            : LATEST_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: 'ncom',
            title: 'NCOM website builder',
            version: '1.0.0',
          },
          instructions: SERVER_INSTRUCTIONS,
        },
      }
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS.filter(
            (tool) => context.canWrite || !tool.write
          ).map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: { title: tool.title, ...tool.annotations },
          })),
        },
      }

    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : ''
      const tool = MCP_TOOLS.find((candidate) => candidate.name === name)
      if (!tool)
        return failure(
          id,
          RPC_ERRORS.invalidParams,
          `Unknown tool: ${name || '(none)'}`
        )
      const args =
        params.arguments &&
        typeof params.arguments === 'object' &&
        !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {}

      if (tool.write && !context.canWrite) {
        return toolResult(
          id,
          {
            error:
              'This connection can only read. Ask the owner to make a key with the "Build websites" permission in NCOM → Settings → AI code editors.',
          },
          true
        )
      }

      if (tool.write) {
        const limit = await context.chargeWrite()
        if (!limit.allowed) {
          return toolResult(
            id,
            {
              error: `Too many changes in a short time. Wait ${limit.retryAfterSeconds ?? 60} seconds, then send this one again.`,
            },
            true
          )
        }
      }

      try {
        // Designs sometimes arrive as a JSON string rather than an object.
        if (typeof args.design === 'string') {
          try {
            args.design = JSON.parse(args.design)
          } catch {
            // Left as text: the design reader explains what is wrong with it.
          }
        }
        const result = await tool.run(args, context)
        return toolResult(id, result, false)
      } catch (cause) {
        if (cause instanceof ToolError)
          return toolResult(id, { error: cause.message }, true)
        // Service errors are written for people ("This subdomain is already
        // taken", plan limits) and are safe to hand back; anything that looks
        // like it escaped from the database is not.
        if (cause instanceof Error && isSafeMessage(cause.message)) {
          return toolResult(id, { error: cause.message }, true)
        }
        console.error('[mcp] tool failed', name, cause)
        return toolResult(
          id,
          { error: 'Something went wrong on NCOM’s side. Try again.' },
          true
        )
      }
    }

    default:
      return failure(
        id,
        RPC_ERRORS.methodNotFound,
        `Method not found: ${message.method}`
      )
  }
}

function toolResult(
  id: JsonRpcId,
  value: unknown,
  isError: boolean
): JsonRpcResponse {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text }],
      ...(typeof value === 'object' && value !== null && !Array.isArray(value)
        ? { structuredContent: value }
        : {}),
      isError,
    },
  }
}

function isSafeMessage(message: string): boolean {
  return (
    message.length > 0 &&
    message.length <= 300 &&
    !message.includes('\n') &&
    !/prisma|invalid `|sql|constraint|column/i.test(message)
  )
}
