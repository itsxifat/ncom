'use client'

import { useActionState, useState, useTransition } from 'react'
import { CheckCircle2, KeyRound, Loader2, PlugZap, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  removeAiKeyAction,
  saveAiConfigAction,
  saveAiKeyAction,
  testAiKeyAction,
  type AiKeyFormState,
} from './actions'
import { SettingsSection } from '@/components/app/settings-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { FormSelect } from '@/components/store/form-controls'

type Action = 'site' | 'page' | 'section'

export interface AiSettingsData {
  key: {
    source: 'admin' | 'environment' | null
    preview: string | null
    savedAt: string | null
  }
  config: {
    enabled: boolean
    model: string
    costs: Record<Action, number>
  }
  models: { id: string; label: string; hint: string }[]
  actionLabels: Record<Action, string>
}

/**
 * Connecting the platform's Claude account, and the AI builder's knobs.
 *
 * The key form saves only a key Anthropic accepts, and the saved key is never
 * sent back to the browser — the status line shows its last four characters.
 */
export function AiSettingsClient({ data }: { data: AiSettingsData }) {
  return (
    <div className="flex flex-col gap-8">
      <ApiKeyCard keyStatus={data.key} />
      <ConfigCard data={data} />
    </div>
  )
}

function ApiKeyCard({ keyStatus }: { keyStatus: AiSettingsData['key'] }) {
  const [state, action, pending] = useActionState<AiKeyFormState, FormData>(
    saveAiKeyAction,
    undefined
  )
  const [testing, startTest] = useTransition()
  const [removing, startRemove] = useTransition()

  return (
    <SettingsSection
      title="Anthropic API key"
      description="The AI builder runs on your Claude account and you pay Anthropic for what it uses. Create a key in the Anthropic Console (console.anthropic.com → API keys) and paste it here. It is encrypted before it is stored."
    >
      <div className="flex flex-col gap-5">
        <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-xl p-4">
          {keyStatus.source ? (
            <>
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Connected{' '}
                  <span className="text-muted-foreground font-mono text-xs">
                    {keyStatus.preview}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {keyStatus.source === 'admin'
                    ? `Saved here${keyStatus.savedAt ? ` on ${new Date(keyStatus.savedAt).toLocaleDateString()}` : ''}.`
                    : 'From ANTHROPIC_API_KEY in the server environment. A key saved here takes its place.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={() =>
                  startTest(async () => {
                    const result = await testAiKeyAction()
                    if (result.ok) toast.success(result.message)
                    else toast.error(result.message)
                  })
                }
              >
                {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
                Test connection
              </Button>
              {keyStatus.source === 'admin' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Remove the key? Workspaces lose the AI builder until a new one is connected.'
                      )
                    ) {
                      return
                    }
                    startRemove(async () => {
                      await removeAiKeyAction()
                      toast.success('Key removed')
                    })
                  }}
                >
                  <Trash2 />
                  Remove
                </Button>
              )}
            </>
          ) : (
            <>
              <KeyRound className="text-muted-foreground size-5 shrink-0" />
              <p className="text-sm">
                Not connected. Until a key is saved, workspaces don’t see the AI
                builder — they can still use their own AI.
              </p>
            </>
          )}
        </div>

        <form action={action} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="apiKey">
              {keyStatus.source ? 'Replace the key' : 'API key'}
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Input
                id="apiKey"
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                className="min-w-64 flex-1 font-mono"
              />
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {pending ? 'Checking…' : 'Save key'}
              </Button>
            </div>
            <FieldDescription>
              It is tested with Anthropic before it is saved.
            </FieldDescription>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.notice && (
              <p className="text-sm text-emerald-600">{state.notice}</p>
            )}
          </Field>
        </form>
      </div>
    </SettingsSection>
  )
}

function ConfigCard({ data }: { data: AiSettingsData }) {
  const [enabled, setEnabled] = useState(data.config.enabled)
  const [model, setModel] = useState(data.config.model)
  const [costs, setCosts] = useState<Record<Action, string>>({
    site: String(data.config.costs.site),
    page: String(data.config.costs.page),
    section: String(data.config.costs.section),
  })
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    startSave(async () => {
      const result = await saveAiConfigAction({ enabled, model, costs })
      if (result.error) setError(result.error)
      else toast.success('AI builder settings saved')
    })
  }

  return (
    <SettingsSection
      title="AI builder"
      description="Who sees it, which Claude model it uses, and what each request costs a workspace in credits. Plans include monthly credits (Plans), and workspaces can buy more (AI credits)."
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Offer the AI builder</p>
            <p className="text-muted-foreground text-xs">
              Off hides it from every workspace, even with a key connected.
            </p>
          </div>
          <Switch
            checked={enabled}
            aria-label="Offer the AI builder"
            onCheckedChange={(next: boolean) => setEnabled(next)}
          />
        </div>

        <Field>
          <FieldLabel htmlFor="model">Model</FieldLabel>
          <FormSelect
            id="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {data.models.map((option) => (
              <option key={option.id} value={option.id}>
                {`${option.label} — ${option.hint}`}
              </option>
            ))}
          </FormSelect>
          <FieldDescription>
            A cheaper model costs you less per request; credit prices below stay
            what you set.
          </FieldDescription>
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Credits per request</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(costs) as Action[]).map((action) => (
              <Field key={action}>
                <FieldLabel htmlFor={`cost-${action}`}>
                  {data.actionLabels[action]}
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id={`cost-${action}`}
                    inputMode="numeric"
                    value={costs[action]}
                    onChange={(event) =>
                      setCosts((current) => ({
                        ...current,
                        [action]: event.target.value,
                      }))
                    }
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-xs">credits</span>
                </div>
              </Field>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            A failed or stopped request is refunded. 0 makes a request free.
          </p>
        </div>

        {error && <FieldError>{error}</FieldError>}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Save settings
          </Button>
          {!enabled && <Badge variant="outline">Hidden from workspaces</Badge>}
        </div>
      </div>
    </SettingsSection>
  )
}
