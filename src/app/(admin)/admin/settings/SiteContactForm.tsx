'use client'

import { useActionState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { saveSiteContactAction } from './actions'

export interface SiteContactValues {
  businessName: string
  supportEmail: string
  whatsapp: string
  phone: string
  facebookUrl: string
  address: string
  hours: string
}

/**
 * The public site's contact details. Whatever is filled in appears in the
 * footer, on /contact, on the Enterprise package and in the legal pages; an
 * empty field is simply left off.
 */
export function SiteContactForm({ values }: { values: SiteContactValues }) {
  const [state, formAction, pending] = useActionState(
    saveSiteContactAction,
    undefined
  )

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="businessName">Business name</FieldLabel>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={values.businessName}
            required
          />
          <FieldDescription>
            Who the Terms, Privacy and Refund pages are from.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="supportEmail">Support email</FieldLabel>
          <Input
            id="supportEmail"
            name="supportEmail"
            type="email"
            defaultValue={values.supportEmail}
            placeholder="support@ncom.bd"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
          <Input
            id="whatsapp"
            name="whatsapp"
            inputMode="tel"
            defaultValue={values.whatsapp}
            placeholder="8801XXXXXXXXX"
          />
          <FieldDescription>
            With the country code; opens a chat.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Phone</FieldLabel>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            defaultValue={values.phone}
            placeholder="+880 1XXX-XXXXXX"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="facebookUrl">Facebook page</FieldLabel>
          <Input
            id="facebookUrl"
            name="facebookUrl"
            type="url"
            defaultValue={values.facebookUrl}
            placeholder="https://facebook.com/…"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="hours">Support hours</FieldLabel>
          <Input
            id="hours"
            name="hours"
            defaultValue={values.hours}
            placeholder="Sat–Thu, 10am–8pm"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="address">Address</FieldLabel>
        <Textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={values.address}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save contact details
        </Button>
        {state?.saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" /> Saved — live on the site now.
          </span>
        )}
      </div>
      {state?.error && <FieldError>{state.error}</FieldError>}
    </form>
  )
}
