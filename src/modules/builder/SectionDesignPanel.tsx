'use client'

import type { SectionConfig } from '../sections/types'
import { ImagePicker } from './ImagePicker'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { FormSelect } from '@/components/ui/form-select'
import { FontPicker } from '@/components/ui/font-picker'

/**
 * Design controls shared by every section.
 *
 * These live here rather than in each section's `editorFields` because they
 * apply to the section *wrapper*, not its content — a hero and a FAQ need the
 * same padding, background and visibility controls, and duplicating them 18
 * times would guarantee they drift apart.
 *
 * Every control writes `undefined` when cleared rather than a default value.
 * That distinction matters: `undefined` means "inherit the page theme", while
 * a concrete value pins the section. Writing a default here would silently
 * detach every section from the theme the first time someone opened this tab.
 */
export function SectionDesignPanel({
  config,
  onChange,
  sampleText,
}: {
  config: SectionConfig
  onChange: (config: SectionConfig) => void
  /**
   * The text this section actually contains, so the font pickers can lead with
   * the script the merchant is writing in and preview their own words.
   */
  sampleText?: string
}) {
  function set<K extends keyof SectionConfig>(key: K, value: SectionConfig[K]) {
    onChange({ ...config, [key]: value })
  }

  /** Empty input → undefined, so the field falls back to the theme. */
  function setNumber(key: keyof SectionConfig, raw: string) {
    const trimmed = raw.trim()
    onChange({
      ...config,
      [key]: trimmed === '' ? undefined : Number(trimmed),
    })
  }

  return (
    <div className="flex flex-col gap-5 px-1 py-2">
      <Group title="Background">
        <Field>
          <FieldLabel>Style</FieldLabel>
          <Select
            value={config.backgroundVariant ?? 'default'}
            onChange={(value) =>
              set(
                'backgroundVariant',
                value as SectionConfig['backgroundVariant']
              )
            }
            options={[
              { value: 'default', label: 'Page background' },
              { value: 'muted', label: 'Subtle tint' },
              { value: 'primary', label: 'Brand colour' },
              { value: 'dark', label: 'Dark' },
              { value: 'custom', label: 'Custom colour' },
            ]}
          />
        </Field>

        {config.backgroundVariant === 'custom' && (
          <Field>
            <FieldLabel>Background colour</FieldLabel>
            <ColorInput
              value={config.backgroundColor ?? '#ffffff'}
              onChange={(value) => set('backgroundColor', value)}
            />
          </Field>
        )}

        <Field>
          <FieldLabel>Background image</FieldLabel>
          <ImagePicker
            value={config.backgroundImageUrl ?? ''}
            onChange={(url) => set('backgroundImageUrl', url || undefined)}
          />
        </Field>

        {config.backgroundImageUrl && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel>Fit</FieldLabel>
                <Select
                  value={config.backgroundSize ?? 'cover'}
                  onChange={(value) =>
                    set(
                      'backgroundSize',
                      value as SectionConfig['backgroundSize']
                    )
                  }
                  options={[
                    { value: 'cover', label: 'Cover' },
                    { value: 'contain', label: 'Contain' },
                    { value: 'auto', label: 'Original' },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel>Position</FieldLabel>
                <Select
                  value={config.backgroundPosition ?? 'center'}
                  onChange={(value) =>
                    set(
                      'backgroundPosition',
                      value as SectionConfig['backgroundPosition']
                    )
                  }
                  options={[
                    { value: 'center', label: 'Center' },
                    { value: 'top', label: 'Top' },
                    { value: 'bottom', label: 'Bottom' },
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                  ]}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>
                Darken image ({config.backgroundOverlay ?? 0}%)
              </FieldLabel>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={config.backgroundOverlay ?? 0}
                onChange={(event) =>
                  set('backgroundOverlay', Number(event.target.value))
                }
                className="w-full"
              />
              <FieldDescription>
                Helps text stay readable over a photo.
              </FieldDescription>
            </Field>
          </>
        )}
      </Group>

      <Group title="Layout">
        <Field>
          <FieldLabel>Text alignment</FieldLabel>
          <Select
            value={config.alignment ?? 'left'}
            onChange={(value) =>
              set('alignment', value as SectionConfig['alignment'])
            }
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel>Padding top</FieldLabel>
            <Input
              type="number"
              min={0}
              max={30}
              step={0.5}
              placeholder="Theme"
              value={config.paddingTop ?? ''}
              onChange={(event) => setNumber('paddingTop', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Padding bottom</FieldLabel>
            <Input
              type="number"
              min={0}
              max={30}
              step={0.5}
              placeholder="Theme"
              value={config.paddingBottom ?? ''}
              onChange={(event) =>
                setNumber('paddingBottom', event.target.value)
              }
            />
          </Field>
        </div>
        <FieldDescription>
          In rem. Leave empty to follow the theme spacing.
        </FieldDescription>

        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.fullWidth ?? false}
            onCheckedChange={(checked) =>
              set('fullWidth', checked || undefined)
            }
          />
          Full width content
        </label>

        {!config.fullWidth && (
          <Field>
            <FieldLabel>Max width (px)</FieldLabel>
            <Input
              type="number"
              min={320}
              max={2000}
              step={20}
              placeholder="Theme"
              value={config.maxWidth ?? ''}
              onChange={(event) => setNumber('maxWidth', event.target.value)}
            />
          </Field>
        )}
      </Group>

      <Group title="Typography">
        <Field>
          <FieldLabel>Heading font</FieldLabel>
          <FontPicker
            value={config.headingFont ?? ''}
            onValueChange={(font) => set('headingFont', font || undefined)}
            sampleText={sampleText}
          />
          <FieldDescription>
            Leave unset to use the page theme&apos;s heading font.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Body font</FieldLabel>
          <FontPicker
            value={config.bodyFont ?? ''}
            onValueChange={(font) => set('bodyFont', font || undefined)}
            sampleText={sampleText}
          />
        </Field>

        {(config.headingFont || config.bodyFont) && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2"
            onClick={() =>
              onChange({
                ...config,
                headingFont: undefined,
                bodyFont: undefined,
              })
            }
          >
            Reset to theme fonts
          </button>
        )}
      </Group>

      <Group title="Colour & borders">
        <Field>
          <FieldLabel>Text colour</FieldLabel>
          <ColorInput
            value={config.textColor ?? ''}
            onChange={(value) => set('textColor', value || undefined)}
            allowClear
          />
        </Field>

        <Field>
          <FieldLabel>Corner radius (px)</FieldLabel>
          <Input
            type="number"
            min={0}
            max={80}
            placeholder="Theme"
            value={config.borderRadius ?? ''}
            onChange={(event) => setNumber('borderRadius', event.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.borderTop ?? false}
            onCheckedChange={(checked) =>
              set('borderTop', checked || undefined)
            }
          />
          Line above
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.borderBottom ?? false}
            onCheckedChange={(checked) =>
              set('borderBottom', checked || undefined)
            }
          />
          Line below
        </label>
      </Group>

      <Group title="Visibility">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.hideOnMobile ?? false}
            onCheckedChange={(checked) =>
              set('hideOnMobile', checked || undefined)
            }
          />
          Hide on mobile
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.hideOnDesktop ?? false}
            onCheckedChange={(checked) =>
              set('hideOnDesktop', checked || undefined)
            }
          />
          Hide on desktop
        </label>
      </Group>

      <Group title="Advanced">
        <Field>
          <FieldLabel>Anchor id</FieldLabel>
          <Input
            value={config.anchorId ?? ''}
            placeholder="features"
            onChange={(event) =>
              set('anchorId', event.target.value || undefined)
            }
          />
          <FieldDescription>
            Link to this section with <code>#your-id</code>.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>CSS class</FieldLabel>
          <Input
            value={config.customClassName ?? ''}
            placeholder="my-section"
            onChange={(event) =>
              set('customClassName', event.target.value || undefined)
            }
          />
          <FieldDescription>
            Target this section from your store&rsquo;s custom CSS in Design.
          </FieldDescription>
        </Field>
      </Group>
    </div>
  )
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-muted-foreground text-xs font-medium uppercase">
        {title}
      </h4>
      {children}
    </section>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <FormSelect
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-card h-9 rounded-[0.875rem] border px-3 text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </FormSelect>
  )
}

function ColorInput({
  value,
  onChange,
  allowClear,
}: {
  value: string
  onChange: (value: string) => void
  allowClear?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={value || '#000000'}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-12 p-1"
      />
      {/* The text field is the accessible path: a bare colour input cannot be
          typed into, pasted into, or read by a screen reader. */}
      <Input
        value={value}
        placeholder={allowClear ? 'Theme' : '#000000'}
        onChange={(event) => onChange(event.target.value)}
      />
      {allowClear && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}
