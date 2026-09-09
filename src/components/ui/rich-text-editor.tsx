'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold,
  Eraser,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  Strikethrough,
  Underline,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { sanitizeRichText } from '@/modules/sections/sanitizeHtml'
import { ColorSwatchButton } from '@/components/ui/color-picker'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

/**
 * The editor behind every rich-text field.
 *
 * A `contenteditable` whose formatting is applied two different ways, and the
 * split is the whole design of this file:
 *
 * - **Toggles** (bold, italic, clear) go through `document.execCommand`. It is
 *   formally deprecated and still the only thing every browser implements for
 *   "make the selected words bold" — the alternative is a custom selection
 *   model over a document tree, which is a text editor, not a form control.
 * - **Anything chosen from a popup** (colour, size) is applied to a *saved
 *   range* instead, by wrapping it in a span directly.
 *
 * That second path exists because `execCommand` only acts on the focused
 * element with a live selection, and every popup — a colour picker, a dropdown
 * — takes focus away the moment it opens. The old colour button did use
 * `execCommand`, and it could not work: by the time a colour came back there
 * was nothing selected to apply it to. Wrapping a saved range needs no focus at
 * all, so the popup can stay open and the text recolours live underneath it.
 *
 * Everything produced either way is put through the same sanitiser the renderer
 * uses before it is stored, so what is kept is exactly what a page will show.
 *
 * Uncontrolled on purpose. Writing `value` back into the DOM on every keystroke
 * would move the caret to the end of the field on each character — the classic
 * contenteditable-in-React bug. The DOM owns the text while the merchant is
 * typing; `value` is only pushed in when it changes from somewhere else.
 */

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72]

interface Marks {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  link: boolean
}

const NO_MARKS: Marks = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  link: false,
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** A taller box, for fields holding paragraphs rather than a line. */
  multiline?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // What we last handed the parent. Comparing against this is how an external
  // change (undo, a different section selected) is told apart from the echo of
  // our own `onChange` coming back as a new `value`.
  const lastEmitted = useRef<string | null>(null)
  /**
   * The last selection that was inside this editor.
   *
   * Kept because the browser's own selection is gone by the time a popup hands
   * back a colour, and this is the only record of what the merchant had picked
   * out when they reached for the control.
   */
  const saved = useRef<Range | null>(null)
  /**
   * The span the last popup control created, while the selection still covers
   * exactly it.
   *
   * Dragging a colour slider fires a change per frame. Wrapping the selection
   * again each time would bury the text under a hundred nested spans in a
   * second — so the first drag builds the span and every frame after it just
   * rewrites that span's style.
   */
  const styled = useRef<HTMLSpanElement | null>(null)
  const [empty, setEmpty] = useState(!value)
  const [marks, setMarks] = useState<Marks>(NO_MARKS)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (value === lastEmitted.current) return
    node.innerHTML = sanitizeRichText(value)
    lastEmitted.current = value
    setEmpty(!node.textContent?.trim())
  }, [value])

  const emit = useCallback(() => {
    const node = ref.current
    if (!node) return
    // Sanitised on the way out, not only on render: it keeps pasted markup from
    // accumulating in the database, and means what the merchant sees in this
    // box is exactly what the page will show.
    const html = sanitizeRichText(node.innerHTML)
    lastEmitted.current = html
    setEmpty(!node.textContent?.trim())
    onChange(html)
  }, [onChange])

  /** Whether a range sits inside this editor, rather than elsewhere on the page. */
  const owns = useCallback((range: Range | null) => {
    const node = ref.current
    return Boolean(
      node && range && node.contains(range.commonAncestorContainer)
    )
  }, [])

  // The selection is recorded continuously rather than on each button's
  // mousedown, because by the time a *second* popup control is used the first
  // one has already moved focus and there is no mousedown on the editor left to
  // hang it off.
  useEffect(() => {
    function onSelectionChange() {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      if (!owns(range)) return
      saved.current = range.cloneRange()
      // The moment the merchant selects something else, the span the last
      // popup built stops being the thing to keep rewriting.
      if (!wrapsExactly(range, styled.current)) styled.current = null
      setMarks({
        bold: queryState('bold'),
        italic: queryState('italic'),
        underline: queryState('underline'),
        strike: queryState('strikeThrough'),
        link: Boolean(closestLink(range, ref.current)),
      })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () =>
      document.removeEventListener('selectionchange', onSelectionChange)
  }, [owns])

  /** Puts the saved selection back and focuses the editor, for `execCommand`. */
  const restore = useCallback((): boolean => {
    const node = ref.current
    if (!node) return false
    node.focus({ preventScroll: true })
    const selection = window.getSelection()
    if (!selection) return false
    const range = saved.current
    if (owns(range)) {
      selection.removeAllRanges()
      selection.addRange(range!)
      return true
    }
    return selection.rangeCount > 0 && owns(selection.getRangeAt(0))
  }, [owns])

  /** Runs a command against the current selection and reports the result. */
  const run = useCallback(
    (command: string, argument?: string) => {
      if (!restore()) return
      // Without this, `bold` emits `<b>` but colour commands emit
      // `<font color>`, which the sanitiser drops — the change would appear to
      // work in the editor and vanish on the page.
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(command, false, argument)
      emit()
    },
    [emit, restore]
  )

  /**
   * Wraps the saved selection in a span carrying one CSS declaration.
   *
   * `extractContents` + `insertNode` rather than `surroundContents`, which
   * throws whenever a range starts inside one element and ends inside another —
   * which is most of the selections anyone actually makes. Extracting and
   * re-inserting handles a partial selection by construction.
   *
   * Needs no focus, which is the whole point: it can run while a colour picker
   * is open and being dragged.
   */
  const styleSelection = useCallback(
    (property: 'color' | 'backgroundColor' | 'fontSize', value: string) => {
      const node = ref.current
      const range = saved.current
      if (!node || !owns(range) || range!.collapsed) return

      // Still on the span this control just built: rewrite it rather than
      // wrapping it again. This is also what makes colour and size compose —
      // both land as declarations on one span instead of two nested ones.
      const existing = styled.current
      if (
        existing &&
        node.contains(existing) &&
        wrapsExactly(range, existing)
      ) {
        existing.style[property] = value
        emit()
        return
      }

      const span = document.createElement('span')
      span.style[property] = value
      span.appendChild(range!.extractContents())
      range!.insertNode(span)
      styled.current = span

      // Re-point the saved range at what was just wrapped, so dragging a colour
      // slider keeps recolouring the same words instead of the first frame's
      // and then nothing.
      const next = document.createRange()
      next.selectNodeContents(span)
      saved.current = next

      const selection = window.getSelection()
      // Only worth re-showing if the caret is still notionally in here; moving
      // the visible selection while a popup has focus would steal it back.
      if (
        selection &&
        owns(selection.rangeCount ? selection.getRangeAt(0) : null)
      ) {
        selection.removeAllRanges()
        selection.addRange(next.cloneRange())
      }
      emit()
    },
    [emit, owns]
  )

  const hasSelection = () => owns(saved.current) && !saved.current!.collapsed

  return (
    <div
      className={cn(
        'border-input bg-card focus-within:ring-ring/40 overflow-hidden rounded-[0.875rem] border focus-within:ring-2',
        className
      )}
    >
      <div className="border-input bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          active={marks.bold}
          onClick={() => run('bold')}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={marks.italic}
          onClick={() => run('italic')}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={marks.underline}
          onClick={() => run('underline')}
        >
          <Underline className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={marks.strike}
          onClick={() => run('strikeThrough')}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>

        <span className="bg-border mx-1 h-4 w-px" />

        <ColorSwatchButton
          title="Text colour"
          value={undefined}
          allowClear={false}
          onChange={(colour) => colour && styleSelection('color', colour)}
        >
          <span className="text-[13px] leading-none font-bold">A</span>
        </ColorSwatchButton>
        <ColorSwatchButton
          title="Highlight"
          value={undefined}
          allowClear={false}
          onChange={(colour) =>
            colour && styleSelection('backgroundColor', colour)
          }
        >
          <Highlighter className="size-3.5" />
        </ColorSwatchButton>

        <span className="bg-border mx-1 h-4 w-px" />

        {/* Held at the empty option rather than at the last size chosen: this
            is an action ("make the selection 24px"), not a property of the
            field, and a select that kept showing 24 would be claiming
            something about text the merchant has since moved away from. */}
        <FormSelect
          aria-label="Font size"
          size="sm"
          value=""
          onChange={(event) => {
            const size = Number(event.target.value)
            if (size) styleSelection('fontSize', `${size}px`)
          }}
          className="h-7 w-[4.5rem] rounded-md px-1.5 text-xs"
        >
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </FormSelect>

        <LinkButton
          active={marks.link}
          canLink={hasSelection}
          onApply={(href) => run('createLink', href)}
          onRemove={() => run('unlink')}
        />

        <span className="bg-border mx-1 h-4 w-px" />

        <ToolbarButton
          label="Clear formatting"
          onClick={() => {
            run('removeFormat')
            run('unlink')
          }}
        >
          <Eraser className="size-3.5" />
        </ToolbarButton>
      </div>

      <div className="relative">
        {empty && placeholder && (
          <span className="text-muted-foreground pointer-events-none absolute top-2 left-3 text-sm">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline={multiline}
          onInput={emit}
          onBlur={emit}
          onPaste={(event) => {
            // Pasting from a word processor drags in a document's worth of
            // markup — fonts, margins, classes, sometimes whole tables. The
            // sanitiser would strip it on the way out anyway; taking the plain
            // text here means the merchant sees the clean result immediately
            // rather than watching their paste reformat itself on blur.
            event.preventDefault()
            const text = event.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
          }}
          onKeyDown={(event) => {
            // A single-line field must not grow a second paragraph. The block
            // decides where its lines break; this field holds one of them.
            if (event.key === 'Enter' && !multiline) event.preventDefault()
          }}
          className={cn(
            'w-full px-3 py-2 text-sm outline-none',
            multiline ? 'min-h-24' : 'min-h-9'
          )}
        />
      </div>
    </div>
  )
}

/** Whether a range covers exactly one element's children, and nothing else. */
function wrapsExactly(range: Range | null, node: Node | null): boolean {
  return Boolean(
    range &&
    node &&
    range.startContainer === node &&
    range.endContainer === node &&
    range.startOffset === 0 &&
    range.endOffset === node.childNodes.length
  )
}

/** `queryCommandState`, which throws in some browsers when nothing is focused. */
function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

/** The `<a>` a range sits inside, if it is inside one. */
function closestLink(
  range: Range,
  root: HTMLElement | null
): HTMLElement | null {
  const start =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
  const anchor = start?.closest('a')
  return anchor && root?.contains(anchor) ? anchor : null
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // The selection is lost the moment the editor blurs, and a plain click
      // blurs it before the handler runs — so the command would apply to
      // nothing. Preventing the default on mousedown keeps focus where it is.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

/**
 * Adds or removes a link on the selected words.
 *
 * A popover rather than `window.prompt`. The prompt was a modal that blocked
 * the whole page, could not be styled, and — on the "select some words first"
 * path — used `window.alert` to tell a merchant off for a rule the button had
 * given no sign of.
 */
function LinkButton({
  active,
  canLink,
  onApply,
  onRemove,
}: {
  active: boolean
  canLink: () => boolean
  onApply: (href: string) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('https://')
  const [selected, setSelected] = useState(false)

  if (active) {
    return (
      <ToolbarButton label="Remove link" active onClick={onRemove}>
        <Link2Off className="size-3.5" />
      </ToolbarButton>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Read while the selection is still live — the popover takes focus the
        // moment it opens, and after that there is nothing to ask.
        if (next) setSelected(canLink())
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Add link"
            aria-label="Add link"
            onMouseDown={(event) => event.preventDefault()}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md"
          />
        }
      >
        <Link2 className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] w-64">
        {selected ? (
          <>
            <Input
              autoFocus
              value={href}
              spellCheck={false}
              placeholder="https://"
              aria-label="Link address"
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                onApply(event.currentTarget.value)
                setOpen(false)
              }}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(href)
                setOpen(false)
              }}
            >
              Link
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-xs leading-relaxed">
            Select the words you want to link, then press this again.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
