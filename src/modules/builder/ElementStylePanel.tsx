'use client'

import { useEffect, useState } from 'react'
import { Bookmark, RotateCcw, Trash2 } from 'lucide-react'

import { useBuilderStore, styleBreakpoint } from './store'
import {
  ColorControl,
  CornersControl,
  Group,
  LengthControl,
  NumberControl,
  Row,
  SelectControl,
  ShadowControl,
  SidesControl,
  ToggleControl,
} from './ElementStyleControls'
import {
  deletePreset,
  loadPresets,
  savePreset,
  type StylePreset,
} from './stylePresets'
import {
  ANIMATION_TYPES,
  EASINGS,
  type ElementStyle,
} from '../sections/elementStyle'
import type { ElementKind } from '../sections/elementDescriptors'
import { FONT_GROUPS } from '@/lib/fonts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Everything one element can be told to look like.
 *
 * Two switches sit above the controls and change what they write to, rather
 * than changing what they are — which is what keeps a panel this large from
 * needing three copies of itself:
 *
 * - **The breakpoint** comes from the canvas frame the merchant is previewing.
 *   Editing while the phone frame is up writes the mobile override; there is no
 *   separate "responsive mode" to remember to leave.
 * - **Normal / Hover** switches the target between the element's resting style
 *   and its hover state.
 *
 * Which groups appear depends on the element's kind. A spacer has no line
 * height and an image has no letter spacing; showing every control for every
 * element would bury the four that matter under thirty that do not.
 */

const FONT_WEIGHTS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra bold' },
  { value: '900', label: 'Black' },
] as const

const TEXTUAL: ElementKind[] = ['text', 'heading', 'button', 'container']

export function ElementStylePanel({
  sectionId,
  elementKey,
  kind,
  label,
}: {
  sectionId: string
  elementKey: string
  kind: ElementKind
  label: string
}) {
  const breakpoint = useBuilderStore((s) => s.breakpoint)
  const sections = useBuilderStore((s) => s.sections)
  const setElementStyle = useBuilderStore((s) => s.setElementStyle)
  const setElementDesign = useBuilderStore((s) => s.setElementDesign)
  const resetElementProperty = useBuilderStore((s) => s.resetElementProperty)
  const resetElement = useBuilderStore((s) => s.resetElement)

  const [target, setTarget] = useState<'normal' | 'hover'>('normal')
  const [linkPadding, setLinkPadding] = useState(true)
  const [linkMargin, setLinkMargin] = useState(true)
  const [linkBorder, setLinkBorder] = useState(true)
  const [linkRadius, setLinkRadius] = useState(true)
  const [presets, setPresets] = useState<StylePreset[]>([])

  // Read on mount rather than during render: `localStorage` does not exist on
  // the server, so reading it in a render body would either crash there or
  // hydrate to different markup than the server produced. The extra render
  // this costs is the point, not an accident.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value
  useEffect(() => setPresets(loadPresets()), [])

  const bp = styleBreakpoint(breakpoint)
  const section = sections.find((s) => s.id === sectionId)
  const design = section?.config?.elements?.[elementKey]
  const editingHover = target === 'hover'
  const style: ElementStyle =
    (editingHover ? design?.hover : design?.[bp]) ?? {}

  function set(patch: Partial<ElementStyle>) {
    if (editingHover) {
      setElementDesign(sectionId, elementKey, {
        hover: { ...design?.hover, ...patch },
      })
      return
    }
    setElementStyle(sectionId, elementKey, bp, patch)
  }

  function reset(property: keyof ElementStyle) {
    if (editingHover) {
      const next = { ...design?.hover }
      delete next[property]
      setElementDesign(sectionId, elementKey, { hover: next })
      return
    }
    resetElementProperty(sectionId, elementKey, bp, property)
  }

  /** Whether a property is pinned at whatever is currently being edited. */
  const has = (property: keyof ElementStyle) => style[property] !== undefined

  const textual = TEXTUAL.includes(kind)
  const boxy = kind !== 'spacer' && kind !== 'divider'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={() => resetElement(sectionId, elementKey)}
          title="Clear every style on this element"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[10px]"
        >
          <RotateCcw className="size-3" /> Reset all
        </button>
      </div>

      <div className="bg-muted flex rounded-full p-0.5 text-[11px]">
        {(['normal', 'hover'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTarget(option)}
            className={cn(
              'flex-1 rounded-full px-2 py-1 font-medium capitalize',
              target === option
                ? 'bg-card shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {editingHover ? (
        <p className="text-muted-foreground rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed">
          Only what changes on hover. Anything left empty keeps its normal
          value. Hover does not exist on a phone, so these apply on pointer
          devices only.
        </p>
      ) : (
        breakpoint !== 'desktop' && (
          <p className="text-muted-foreground rounded-md bg-blue-500/10 px-2 py-1.5 text-[10px] leading-relaxed">
            Editing <strong>{breakpoint}</strong>. Anything left empty follows
            the desktop value — set only what needs to differ here.
          </p>
        )
      )}

      {textual && (
        <Group title="Text" defaultOpen>
          <Row
            label="Font"
            set={has('fontFamily')}
            onReset={() => reset('fontFamily')}
          >
            <select
              value={style.fontFamily ?? ''}
              onChange={(event) =>
                set({ fontFamily: event.target.value || undefined })
              }
              className="border-input bg-card h-8 rounded-[0.625rem] border px-2 text-xs"
            >
              <option value="">Theme font</option>
              {FONT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.fonts.map((font) => (
                    <option key={font.name} value={font.name}>
                      {font.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Row>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Size"
              set={has('fontSize')}
              onReset={() => reset('fontSize')}
            >
              <NumberControl
                value={style.fontSize}
                onChange={(value) => set({ fontSize: value })}
                min={8}
                max={200}
                suffix="px"
              />
            </Row>
            <Row
              label="Weight"
              set={has('fontWeight')}
              onReset={() => reset('fontWeight')}
            >
              <SelectControl
                value={style.fontWeight ? String(style.fontWeight) : undefined}
                onChange={(value) =>
                  set({ fontWeight: value ? Number(value) : undefined })
                }
                options={FONT_WEIGHTS}
              />
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Line height"
              set={has('lineHeight')}
              onReset={() => reset('lineHeight')}
              hint="Multiple of the size"
            >
              <NumberControl
                value={style.lineHeight}
                onChange={(value) => set({ lineHeight: value })}
                min={0.5}
                max={4}
                step={0.05}
              />
            </Row>
            <Row
              label="Letter spacing"
              set={has('letterSpacing')}
              onReset={() => reset('letterSpacing')}
            >
              <NumberControl
                value={style.letterSpacing}
                onChange={(value) => set({ letterSpacing: value })}
                min={-20}
                max={60}
                step={0.5}
                suffix="px"
              />
            </Row>
          </div>

          <Row label="Colour" set={has('color')} onReset={() => reset('color')}>
            <ColorControl
              value={style.color}
              onChange={(value) => set({ color: value })}
            />
          </Row>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Alignment"
              set={has('textAlign')}
              onReset={() => reset('textAlign')}
            >
              <SelectControl
                value={style.textAlign}
                onChange={(value) => set({ textAlign: value })}
                options={['left', 'center', 'right', 'justify'] as const}
              />
            </Row>
            <Row
              label="Case"
              set={has('textTransform')}
              onReset={() => reset('textTransform')}
            >
              <SelectControl
                value={style.textTransform}
                onChange={(value) => set({ textTransform: value })}
                options={
                  ['none', 'uppercase', 'lowercase', 'capitalize'] as const
                }
              />
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Style"
              set={has('fontStyle')}
              onReset={() => reset('fontStyle')}
            >
              <SelectControl
                value={style.fontStyle}
                onChange={(value) => set({ fontStyle: value })}
                options={['normal', 'italic'] as const}
              />
            </Row>
            <Row
              label="Decoration"
              set={has('textDecoration')}
              onReset={() => reset('textDecoration')}
            >
              <SelectControl
                value={style.textDecoration}
                onChange={(value) => set({ textDecoration: value })}
                options={['none', 'underline', 'line-through'] as const}
              />
            </Row>
          </div>

          <Row
            label="Limit to lines"
            set={has('lineClamp')}
            onReset={() => reset('lineClamp')}
            hint="Cuts off with an ellipsis"
          >
            <NumberControl
              value={style.lineClamp}
              onChange={(value) => set({ lineClamp: value })}
              min={1}
              max={20}
              placeholder="No limit"
              suffix="lines"
            />
          </Row>

          <Row
            label="Text shadow"
            set={has('textShadow')}
            onReset={() => reset('textShadow')}
          >
            <ShadowControl
              value={style.textShadow}
              onChange={(value) => set({ textShadow: value })}
              allowInset={false}
            />
          </Row>
        </Group>
      )}

      <Group title="Fill">
        <Row
          label="Background"
          set={has('backgroundColor')}
          onReset={() => reset('backgroundColor')}
        >
          <ColorControl
            value={style.backgroundColor}
            onChange={(value) => set({ backgroundColor: value })}
          />
        </Row>

        <Row
          label="Gradient"
          set={has('gradient')}
          onReset={() => reset('gradient')}
          hint="Overrides a background image"
        >
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <ColorControl
                value={style.gradient?.from}
                onChange={(from) =>
                  set({ gradient: { ...style.gradient, from } })
                }
                placeholder="From"
              />
              <ColorControl
                value={style.gradient?.to}
                onChange={(to) => set({ gradient: { ...style.gradient, to } })}
                placeholder="To"
              />
            </div>
            <NumberControl
              value={style.gradient?.angle}
              onChange={(angle) =>
                set({ gradient: { ...style.gradient, angle } })
              }
              min={0}
              max={360}
              step={5}
              suffix="deg"
              placeholder="180"
            />
          </div>
        </Row>

        <Row
          label="Opacity"
          set={has('opacity')}
          onReset={() => reset('opacity')}
        >
          <NumberControl
            value={style.opacity}
            onChange={(value) => set({ opacity: value })}
            min={0}
            max={100}
            suffix="%"
          />
        </Row>
      </Group>

      {boxy && (
        <Group title="Size & spacing">
          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Width"
              set={has('width')}
              onReset={() => reset('width')}
            >
              <LengthControl
                value={style.width}
                onChange={(value) => set({ width: value })}
              />
            </Row>
            <Row
              label="Height"
              set={has('height')}
              onReset={() => reset('height')}
            >
              <LengthControl
                value={style.height}
                onChange={(value) => set({ height: value })}
              />
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Max width"
              set={has('maxWidth')}
              onReset={() => reset('maxWidth')}
            >
              <LengthControl
                value={style.maxWidth}
                onChange={(value) => set({ maxWidth: value })}
                allowAuto={false}
                placeholder="None"
              />
            </Row>
            <Row
              label="Min height"
              set={has('minHeight')}
              onReset={() => reset('minHeight')}
            >
              <LengthControl
                value={style.minHeight}
                onChange={(value) => set({ minHeight: value })}
                allowAuto={false}
                placeholder="None"
              />
            </Row>
          </div>

          <Row
            label="Padding"
            set={has('padding')}
            onReset={() => reset('padding')}
          >
            <SidesControl
              value={style.padding}
              onChange={(value) => set({ padding: value })}
              linked={linkPadding}
              onLinkedChange={setLinkPadding}
              min={0}
            />
          </Row>

          <Row
            label="Margin"
            set={has('margin')}
            onReset={() => reset('margin')}
          >
            <SidesControl
              value={style.margin}
              onChange={(value) => set({ margin: value })}
              linked={linkMargin}
              onLinkedChange={setLinkMargin}
            />
          </Row>
        </Group>
      )}

      {boxy && (
        <Group title="Border & shadow">
          <Row
            label="Border width"
            set={has('borderWidth')}
            onReset={() => reset('borderWidth')}
          >
            <SidesControl
              value={style.borderWidth}
              onChange={(value) => set({ borderWidth: value })}
              linked={linkBorder}
              onLinkedChange={setLinkBorder}
              min={0}
              max={100}
            />
          </Row>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Border style"
              set={has('borderStyle')}
              onReset={() => reset('borderStyle')}
            >
              <SelectControl
                value={style.borderStyle}
                onChange={(value) => set({ borderStyle: value })}
                options={['solid', 'dashed', 'dotted', 'double'] as const}
                placeholder="Solid"
              />
            </Row>
            <Row
              label="Border colour"
              set={has('borderColor')}
              onReset={() => reset('borderColor')}
            >
              <ColorControl
                value={style.borderColor}
                onChange={(value) => set({ borderColor: value })}
                placeholder="Text colour"
              />
            </Row>
          </div>

          <Row
            label="Corner radius"
            set={has('borderRadius')}
            onReset={() => reset('borderRadius')}
          >
            <CornersControl
              value={style.borderRadius}
              onChange={(value) => set({ borderRadius: value })}
              linked={linkRadius}
              onLinkedChange={setLinkRadius}
            />
          </Row>

          <Row
            label="Shadow"
            set={has('boxShadow')}
            onReset={() => reset('boxShadow')}
          >
            <ShadowControl
              value={style.boxShadow}
              onChange={(value) => set({ boxShadow: value })}
            />
          </Row>
        </Group>
      )}

      <Group title="Effects">
        <div className="grid grid-cols-2 gap-2">
          <Row
            label="Rotate"
            set={has('rotate')}
            onReset={() => reset('rotate')}
          >
            <NumberControl
              value={style.rotate}
              onChange={(value) => set({ rotate: value })}
              min={-360}
              max={360}
              suffix="deg"
            />
          </Row>
          <Row label="Scale" set={has('scale')} onReset={() => reset('scale')}>
            <NumberControl
              value={style.scale}
              onChange={(value) => set({ scale: value })}
              min={1}
              max={500}
              suffix="%"
            />
          </Row>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Row
            label="Nudge across"
            set={has('offsetX')}
            onReset={() => reset('offsetX')}
          >
            <NumberControl
              value={style.offsetX}
              onChange={(value) => set({ offsetX: value })}
              min={-2000}
              max={2000}
              suffix="px"
            />
          </Row>
          <Row
            label="Nudge down"
            set={has('offsetY')}
            onReset={() => reset('offsetY')}
          >
            <NumberControl
              value={style.offsetY}
              onChange={(value) => set({ offsetY: value })}
              min={-2000}
              max={2000}
              suffix="px"
            />
          </Row>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Row label="Blur" set={has('blur')} onReset={() => reset('blur')}>
            <NumberControl
              value={style.blur}
              onChange={(value) => set({ blur: value })}
              min={0}
              max={100}
              suffix="px"
            />
          </Row>
          <Row
            label="Grayscale"
            set={has('grayscale')}
            onReset={() => reset('grayscale')}
          >
            <NumberControl
              value={style.grayscale}
              onChange={(value) => set({ grayscale: value })}
              min={0}
              max={100}
              suffix="%"
            />
          </Row>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Row
            label="Brightness"
            set={has('brightness')}
            onReset={() => reset('brightness')}
          >
            <NumberControl
              value={style.brightness}
              onChange={(value) => set({ brightness: value })}
              min={0}
              max={300}
              suffix="%"
            />
          </Row>
          <Row
            label="Saturation"
            set={has('saturate')}
            onReset={() => reset('saturate')}
          >
            <NumberControl
              value={style.saturate}
              onChange={(value) => set({ saturate: value })}
              min={0}
              max={300}
              suffix="%"
            />
          </Row>
        </div>
      </Group>

      {kind === 'image' && (
        <Group title="Image">
          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Fit"
              set={has('objectFit')}
              onReset={() => reset('objectFit')}
            >
              <SelectControl
                value={style.objectFit}
                onChange={(value) => set({ objectFit: value })}
                options={
                  ['cover', 'contain', 'fill', 'none', 'scale-down'] as const
                }
              />
            </Row>
            <Row
              label="Focus"
              set={has('objectPosition')}
              onReset={() => reset('objectPosition')}
            >
              <SelectControl
                value={style.objectPosition}
                onChange={(value) => set({ objectPosition: value })}
                options={['center', 'top', 'bottom', 'left', 'right'] as const}
              />
            </Row>
          </div>
          <Row
            label="Aspect ratio"
            set={has('aspectRatio')}
            onReset={() => reset('aspectRatio')}
            hint="Like 16 / 9"
          >
            <SelectControl
              value={style.aspectRatio}
              onChange={(value) => set({ aspectRatio: value })}
              options={[
                { value: '1 / 1', label: 'Square' },
                { value: '4 / 3', label: 'Landscape' },
                { value: '3 / 4', label: 'Portrait' },
                { value: '16 / 9', label: 'Wide' },
                { value: '21 / 9', label: 'Ultra wide' },
              ]}
              placeholder="Natural"
            />
          </Row>
        </Group>
      )}

      {kind === 'container' && (
        <Group title="Layout">
          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Display"
              set={has('display')}
              onReset={() => reset('display')}
            >
              <SelectControl
                value={style.display}
                onChange={(value) => set({ display: value })}
                options={
                  [
                    'block',
                    'inline-block',
                    'flex',
                    'inline-flex',
                    'grid',
                  ] as const
                }
              />
            </Row>
            <Row label="Gap" set={has('gap')} onReset={() => reset('gap')}>
              <NumberControl
                value={style.gap}
                onChange={(value) => set({ gap: value })}
                min={0}
                max={400}
                suffix="px"
              />
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Direction"
              set={has('flexDirection')}
              onReset={() => reset('flexDirection')}
            >
              <SelectControl
                value={style.flexDirection}
                onChange={(value) => set({ flexDirection: value })}
                options={
                  ['row', 'row-reverse', 'column', 'column-reverse'] as const
                }
              />
            </Row>
            <Row
              label="Columns"
              set={has('gridColumns')}
              onReset={() => reset('gridColumns')}
              hint="Switches to a grid"
            >
              <NumberControl
                value={style.gridColumns}
                onChange={(value) => set({ gridColumns: value })}
                min={1}
                max={12}
              />
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Row
              label="Justify"
              set={has('justifyContent')}
              onReset={() => reset('justifyContent')}
            >
              <SelectControl
                value={style.justifyContent}
                onChange={(value) => set({ justifyContent: value })}
                options={[
                  { value: 'flex-start', label: 'Start' },
                  { value: 'center', label: 'Centre' },
                  { value: 'flex-end', label: 'End' },
                  { value: 'space-between', label: 'Space between' },
                  { value: 'space-around', label: 'Space around' },
                ]}
              />
            </Row>
            <Row
              label="Align"
              set={has('alignItems')}
              onReset={() => reset('alignItems')}
            >
              <SelectControl
                value={style.alignItems}
                onChange={(value) => set({ alignItems: value })}
                options={[
                  { value: 'flex-start', label: 'Start' },
                  { value: 'center', label: 'Centre' },
                  { value: 'flex-end', label: 'End' },
                  { value: 'stretch', label: 'Stretch' },
                  { value: 'baseline', label: 'Baseline' },
                ]}
              />
            </Row>
          </div>
        </Group>
      )}

      <Group title="Position">
        <Row
          label="Positioning"
          set={has('position')}
          onReset={() => reset('position')}
          hint={
            style.position === 'absolute'
              ? 'Free — this element no longer affects the ones around it, and will need placing again for tablet and mobile.'
              : 'In the layout — moves with everything around it and stays responsive.'
          }
        >
          <ToggleControl
            label="Position freely"
            checked={style.position === 'absolute'}
            onChange={(free) =>
              set(
                free
                  ? { position: 'absolute' }
                  : {
                      // Coordinates go with it. Left behind, they would apply
                      // again the next time free positioning was turned on,
                      // snapping the element somewhere the merchant last left
                      // it weeks ago.
                      position: undefined,
                      top: undefined,
                      left: undefined,
                      right: undefined,
                      bottom: undefined,
                    }
              )
            }
          />
        </Row>

        {style.position === 'absolute' && (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Left" set={has('left')} onReset={() => reset('left')}>
              <LengthControl
                value={style.left}
                onChange={(value) => set({ left: value })}
                allowAuto={false}
                placeholder="—"
              />
            </Row>
            <Row label="Top" set={has('top')} onReset={() => reset('top')}>
              <LengthControl
                value={style.top}
                onChange={(value) => set({ top: value })}
                allowAuto={false}
                placeholder="—"
              />
            </Row>
            <Row
              label="Right"
              set={has('right')}
              onReset={() => reset('right')}
            >
              <LengthControl
                value={style.right}
                onChange={(value) => set({ right: value })}
                allowAuto={false}
                placeholder="—"
              />
            </Row>
            <Row
              label="Bottom"
              set={has('bottom')}
              onReset={() => reset('bottom')}
            >
              <LengthControl
                value={style.bottom}
                onChange={(value) => set({ bottom: value })}
                allowAuto={false}
                placeholder="—"
              />
            </Row>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Row
            label="Stacking"
            set={has('zIndex')}
            onReset={() => reset('zIndex')}
            hint="Higher sits on top"
          >
            <NumberControl
              value={style.zIndex}
              onChange={(value) => set({ zIndex: value })}
              min={-100}
              max={9999}
            />
          </Row>
          <Row label="Order" set={has('order')} onReset={() => reset('order')}>
            <NumberControl
              value={style.order}
              onChange={(value) => set({ order: value })}
              min={-50}
              max={50}
            />
          </Row>
        </div>

        <ToggleControl
          label={
            breakpoint === 'desktop'
              ? 'Hide this element'
              : `Hide on ${breakpoint}`
          }
          checked={style.hidden === true}
          onChange={(hidden) => set({ hidden: hidden || undefined })}
        />
      </Group>

      {!editingHover && (
        <Group title="Motion">
          <Row
            label="Transition"
            set={design?.transition?.duration !== undefined}
            onReset={() =>
              setElementDesign(sectionId, elementKey, { transition: undefined })
            }
            hint="How quickly hover changes happen"
          >
            <div className="grid grid-cols-2 gap-2">
              <NumberControl
                value={design?.transition?.duration}
                onChange={(duration) =>
                  setElementDesign(sectionId, elementKey, {
                    transition: { ...design?.transition, duration },
                  })
                }
                min={0}
                max={5000}
                step={50}
                suffix="ms"
                placeholder="None"
              />
              <SelectControl
                value={design?.transition?.easing}
                onChange={(easing) =>
                  setElementDesign(sectionId, elementKey, {
                    transition: { ...design?.transition, easing },
                  })
                }
                options={EASINGS}
                placeholder="Ease out"
              />
            </div>
          </Row>

          <Row
            label="Entrance"
            set={
              design?.animation?.type !== undefined &&
              design.animation.type !== 'none'
            }
            onReset={() =>
              setElementDesign(sectionId, elementKey, { animation: undefined })
            }
            hint="Plays once, when it scrolls into view"
          >
            <div className="flex flex-col gap-1.5">
              <SelectControl
                value={design?.animation?.type}
                onChange={(type) =>
                  setElementDesign(sectionId, elementKey, {
                    animation: { ...design?.animation, type },
                  })
                }
                options={ANIMATION_TYPES.filter((type) => type !== 'none')}
                placeholder="None"
              />
              {design?.animation?.type && design.animation.type !== 'none' && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberControl
                    value={design.animation.duration}
                    onChange={(duration) =>
                      setElementDesign(sectionId, elementKey, {
                        animation: { ...design.animation, duration },
                      })
                    }
                    min={0}
                    max={5000}
                    step={50}
                    suffix="ms"
                    placeholder="600"
                  />
                  <NumberControl
                    value={design.animation.delay}
                    onChange={(delay) =>
                      setElementDesign(sectionId, elementKey, {
                        animation: { ...design.animation, delay },
                      })
                    }
                    min={0}
                    max={5000}
                    step={50}
                    suffix="delay"
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          </Row>
        </Group>
      )}

      <Group title="Saved styles">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!design}
          onClick={() => {
            if (!design) return
            const name = window.prompt('Name this style', label)
            if (name) setPresets(savePreset(name, design))
          }}
        >
          <Bookmark className="size-3.5" /> Save this element&rsquo;s style
        </Button>

        {presets.length === 0 ? (
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Saved styles are reusable on any element, on any page. They live in
            this browser.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setElementDesign(sectionId, elementKey, {
                      ...structuredClone(preset.design),
                    })
                  }
                  className="hover:bg-accent flex-1 truncate rounded px-2 py-1 text-left text-[11px]"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => setPresets(deletePreset(preset.id))}
                  title="Delete saved style"
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Group>
    </div>
  )
}
