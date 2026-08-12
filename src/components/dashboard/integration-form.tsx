'use client'

import { useActionState } from 'react'
import { updateStoreIntegrationAction } from '@/app/(dashboard)/stores/actions'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export function IntegrationForm({
  storeId,
  gaMeasurementId,
  gtmContainerId,
  metaPixelId,
  customHeadScript,
}: {
  storeId: string
  gaMeasurementId: string | null
  gtmContainerId: string | null
  metaPixelId: string | null
  customHeadScript: string | null
}) {
  const boundAction = updateStoreIntegrationAction.bind(null, storeId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="gaMeasurementId">
            Google Analytics measurement ID
          </FieldLabel>
          <Input
            id="gaMeasurementId"
            name="gaMeasurementId"
            defaultValue={gaMeasurementId ?? ''}
            placeholder="G-XXXXXXXXXX"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="gtmContainerId">
            Google Tag Manager container ID
          </FieldLabel>
          <Input
            id="gtmContainerId"
            name="gtmContainerId"
            defaultValue={gtmContainerId ?? ''}
            placeholder="GTM-XXXXXXX"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="metaPixelId">Meta Pixel ID</FieldLabel>
          <Input
            id="metaPixelId"
            name="metaPixelId"
            defaultValue={metaPixelId ?? ''}
            placeholder="123456789012345"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="customHeadScript">Custom head script</FieldLabel>
          <Textarea
            id="customHeadScript"
            name="customHeadScript"
            defaultValue={customHeadScript ?? ''}
            rows={4}
            className="font-mono text-xs"
          />
          <FieldDescription>
            Injected into the &lt;head&gt; of your published site only — never
            the dashboard. Use with caution.
          </FieldDescription>
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save integrations'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
