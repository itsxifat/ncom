'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  PlugZap,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { LocalTime } from '@/components/app/local-time'
import {
  connectEditorAction,
  disconnectEditorAction,
} from '@/app/(dashboard)/settings/ai-editors/actions'
import { cn } from '@/lib/utils'

interface Connection {
  id: string
  name: string
  prefix: string
  canWrite: boolean
  lastUsedAt: string | null
  createdAt: string
}

type EditorKey =
  'claude-code' | 'cursor' | 'vscode' | 'windsurf' | 'claude-desktop' | 'other'

interface Editor {
  key: EditorKey
  name: string
  /** Where the snippet goes, in plain words. */
  where: string
  language: 'shell' | 'json'
  snippet: (url: string, token: string) => string
  /**
   * The snippet leaves the key out and the editor asks for it, so a file that
   * may end up in git never holds it; the key is shown on its own to paste.
   */
  asksForKey?: boolean
}

/**
 * The setup for each editor, with the key already in it — or, where the file
 * lives in a project that may be pushed to git, shown beside it to paste.
 *
 * Each is the editor's own documented way to add a remote (HTTP) MCP server
 * with a bearer token. Claude Desktop only connects to remote servers through
 * OAuth, so it goes through the small `mcp-remote` bridge, which needs Node.js.
 */
const EDITORS: Editor[] = [
  {
    key: 'claude-code',
    name: 'Claude Code',
    where:
      'Run this in your terminal, in any folder. ncom is then there in every project you open with Claude Code.',
    language: 'shell',
    // `--scope user`: the default scope only adds it for the folder the
    // command was run in. `--header` stays last, as it takes several values.
    snippet: (url, token) =>
      `claude mcp add --transport http --scope user ncom ${url} --header "Authorization: Bearer ${token}"`,
  },
  {
    key: 'cursor',
    name: 'Cursor',
    where:
      'Open Cursor Settings → MCP → Add new MCP server, or paste into ~/.cursor/mcp.json.',
    language: 'json',
    snippet: (url, token) =>
      JSON.stringify(
        {
          mcpServers: {
            ncom: { url, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2
      ),
  },
  {
    key: 'vscode',
    name: 'VS Code',
    where:
      'Save as .vscode/mcp.json in your project (or run “MCP: Open User Configuration” to have it in every project), then start “ncom” from the Copilot Chat tools list.',
    language: 'json',
    asksForKey: true,
    // A project's .vscode folder is often pushed to GitHub, so the key is not
    // written into it: VS Code asks for it once and keeps it in its own
    // secret storage. `${input:ncom-key}` is VS Code's, left as plain text.
    snippet: (url) =>
      JSON.stringify(
        {
          inputs: [
            {
              type: 'promptString',
              id: 'ncom-key',
              description: 'NCOM key',
              password: true,
            },
          ],
          servers: {
            ncom: {
              type: 'http',
              url,
              headers: { Authorization: 'Bearer ${input:ncom-key}' },
            },
          },
        },
        null,
        2
      ),
  },
  {
    key: 'windsurf',
    name: 'Windsurf',
    where:
      'Paste into ~/.codeium/windsurf/mcp_config.json, then refresh MCP servers.',
    language: 'json',
    snippet: (url, token) =>
      JSON.stringify(
        {
          mcpServers: {
            ncom: {
              serverUrl: url,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2
      ),
  },
  {
    key: 'claude-desktop',
    name: 'Claude Desktop',
    where:
      'Settings → Developer → Edit Config, paste into claude_desktop_config.json, and restart Claude. Needs Node.js.',
    language: 'json',
    snippet: (url, token) =>
      JSON.stringify(
        {
          mcpServers: {
            ncom: {
              command: 'npx',
              args: [
                '-y',
                'mcp-remote',
                url,
                '--header',
                'Authorization:${NCOM_AUTH}',
              ],
              env: { NCOM_AUTH: `Bearer ${token}` },
            },
          },
        },
        null,
        2
      ),
  },
  {
    key: 'other',
    name: 'Other',
    where:
      'Any editor that supports remote MCP servers over HTTP: use this address and header.',
    language: 'shell',
    snippet: (url, token) =>
      `MCP server URL:  ${url}\nTransport:       Streamable HTTP\nHeader:          Authorization: Bearer ${token}`,
  },
]

const STARTERS = [
  'Use the ncom tools. Read the design guide, then build me a Bangla landing page for my herbal hair oil, with cash on delivery.',
  'Using ncom, look at my online store and make the home page more modern — keep my categories and products.',
  'Here is my website’s HTML. Rebuild it as an NCOM landing page with ncom, keeping the words and colours.',
  'With ncom, translate every page of my store into Bangla.',
]

/**
 * Connect an AI code editor to this workspace.
 *
 * Made for someone who has never configured an MCP server: pick your editor,
 * press one button, paste one snippet. The key is made for the job — website
 * permissions only, drafts only — shown once inside the snippet, and listed
 * underneath with a Disconnect button.
 */
export function AiEditorConnect({
  mcpUrl,
  canManage,
  connections,
}: {
  mcpUrl: string
  canManage: boolean
  connections: Connection[]
}) {
  const [editor, setEditor] = useState<EditorKey>('claude-code')
  const [canWrite, setCanWrite] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const chosen = EDITORS.find((entry) => entry.key === editor)!

  function connect() {
    startTransition(async () => {
      const result = await connectEditorAction(editor, canWrite)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setToken(result.token)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-card ring-border flex flex-col gap-4 rounded-2xl p-5 ring-1 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-lime text-ink flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Bot className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">
              Build your websites from your AI code editor
            </h2>
            <p className="text-muted-foreground text-sm">
              Connect Cursor, Claude Code, VS Code or Windsurf and ask it to
              design landing pages and store pages. It builds them right here,
              with NCOM’s own blocks — so you can still edit everything with
              drag and drop.
            </p>
          </div>
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="bg-muted/60 flex gap-2 rounded-xl p-3">
            <PlugZap className="mt-0.5 size-4 shrink-0" />
            <span>Pick your editor and copy one setup snippet into it.</span>
          </li>
          <li className="bg-muted/60 flex gap-2 rounded-xl p-3">
            <Bot className="mt-0.5 size-4 shrink-0" />
            <span>
              Ask it in plain words — Bangla or English — what to build.
            </span>
          </li>
          <li className="bg-muted/60 flex gap-2 rounded-xl p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              It saves drafts only. You check them in the builder and publish.
            </span>
          </li>
        </ul>
      </section>

      {!canManage ? (
        <p className="bg-muted/60 rounded-xl p-4 text-sm">
          Only the workspace owner or an admin can connect an editor. Ask them
          to open this page.
        </p>
      ) : (
        <section className="bg-card ring-border flex flex-col gap-5 rounded-2xl p-5 ring-1 sm:p-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">1. Your editor</h3>
            <div className="flex flex-wrap gap-2">
              {EDITORS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setEditor(entry.key)}
                  aria-pressed={editor === entry.key}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition',
                    editor === entry.key
                      ? 'bg-foreground text-background ring-foreground'
                      : 'ring-border hover:ring-foreground/30'
                  )}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>

          {!token ? (
            <div className="flex flex-col gap-4">
              <label className="flex items-start gap-3 text-sm">
                <Switch
                  checked={canWrite}
                  onCheckedChange={(checked) => setCanWrite(Boolean(checked))}
                />
                <span className="flex flex-col">
                  <span className="font-medium">
                    Let it build and change pages
                  </span>
                  <span className="text-muted-foreground text-xs">
                    As drafts — nothing goes live until you publish. Turn off to
                    let it only read your websites.
                  </span>
                </span>
              </label>
              <Button
                onClick={connect}
                disabled={pending}
                className="self-start"
              >
                {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                2. Make my setup snippet
              </Button>
            </div>
          ) : (
            <Snippet editor={chosen} url={mcpUrl} token={token} />
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">
          Things to ask once it’s connected
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <li key={starter}>
              <CopyLine text={starter} />
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Connected editors</h3>
          {connections.length === 0 ? (
            <p className="text-muted-foreground text-sm">None yet.</p>
          ) : (
            <ul className="bg-card ring-border divide-y rounded-2xl ring-1">
              {connections.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function Snippet({
  editor,
  url,
  token,
}: {
  editor: Editor
  url: string
  token: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">
        2. Paste this into {editor.name}
      </h3>
      <p className="text-muted-foreground text-sm">{editor.where}</p>
      <CopyBlock text={editor.snippet(url, token)} />
      {editor.asksForKey && (
        <>
          <p className="text-muted-foreground text-sm">
            When {editor.name} asks for your NCOM key, paste this:
          </p>
          <CopyBlock text={token} />
        </>
      )}
      <p className="text-xs text-amber-700 dark:text-amber-400">
        This is the only time the key is shown. Keep it private — anyone who has
        it can draft pages in your workspace. Lost it? Disconnect it below and
        make a new one. Switch editors above to see the same key set up for
        another one.
      </p>
    </div>
  )
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('Select the text and copy it yourself.')
    }
  }

  return (
    <div className="relative">
      <pre className="bg-muted overflow-x-auto rounded-xl p-4 pr-24 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
        {text}
      </pre>
      <Button
        size="sm"
        variant="outline"
        onClick={copy}
        className="absolute top-2 right-2"
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          // Nothing to do: the text is on screen to copy by hand.
        }
      }}
      className="bg-muted/60 hover:bg-muted flex w-full items-start gap-2 rounded-xl p-3 text-left text-sm transition"
    >
      {copied ? (
        <Check className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Copy className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      )}
      <span>{text}</span>
    </button>
  )
}

function ConnectionRow({ connection }: { connection: Connection }) {
  const [pending, startTransition] = useTransition()
  return (
    <li className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{connection.name}</span>
        <span className="text-muted-foreground text-xs">
          {connection.canWrite ? 'Builds drafts' : 'Reads only'} ·{' '}
          {connection.prefix}…{' · '}
          {connection.lastUsedAt ? (
            <>
              last used <LocalTime at={connection.lastUsedAt} />
            </>
          ) : (
            'not used yet'
          )}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await disconnectEditorAction(connection.id)
            if (result.ok) toast.success('Disconnected')
            else toast.error(result.error ?? 'Could not disconnect')
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Unplug />}
        Disconnect
      </Button>
    </li>
  )
}
