'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold,
  Eraser,
  Highlighter,
  Italic,
  Link2,
  Strikethrough,
  Underline,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { sanitizeRichText } from '@/modules/sections/sanitizeHtml'

/**
 * The editor behind every rich-text field.
 *
 * A `contenteditable` driven by `document.execCommand`. That API is formally
 * deprecated and still the only thing every browser implements for "make the
 * selected words bold" — the alternative is a custom selection model over a
 * document tree, which is a text editor, not a form control. What it produces
 * is normalised on the way out instead: `styleWithCSS` is turned on so commands
 * emit `<span style>` rather than `<font>` tags, and everything is put through
 * the same sanitiser the renderer uses before it is stored.
 *
 * Uncontrolled on purpose. Writing `value` back into the DOM on every keystroke
 * would move the caret to the end of the field on each character — the classic
 * contenteditable-in-React bug. The DOM owns the text while the merchant is
 * typing; `value` is only pushed in when it changes from somewhere else.
 */

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72]

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
  const [empty, setEmpty] = useState(!value)

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

  /** Runs a command against the current selection and reports the result. */
  const run = useCallback(
    (command: string, argument?: string) => {
      const node = ref.current
      if (!node) return
      node.focus()
      // Without this, `bold` emits `<b>` but `foreColor` emits `<font color>`,
      // which the sanitiser drops — the colour would appear to work in the
      // editor and vanish on the page.
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(command, false, argument)
      emit()
    },
    [emit]
  )

  /**
   * Font size, which `execCommand` can only express on the 1–7 `<font>` scale.
   *
   * The command is run for its selection handling — it knows how to split
   * partially-selected nodes, which is the hard part — and the `<font>` tags it
   * leaves behind are then rewritten to the span the sanitiser accepts.
   */
  const setFontSize = useCallback(
    (size: number) => {
      const node = ref.current
      if (!node) return
      node.focus()
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand('fontSize', false, '7')
      for (const font of Array.from(node.querySelectorAll('font[size="7"]'))) {
        const span = document.createElement('span')
        span.style.fontSize = `${size}px`
        while (font.firstChild) span.appendChild(font.firstChild)
        font.replaceWith(span)
      }
      emit()
    },
    [emit]
  )

  const addLink = useCallback(() => {
    const node = ref.current
    if (!node) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      // `createLink` on an empty selection silently does nothing, which reads
      // as a broken button. Say why instead.
      window.alert('Select the words you want to link first.')
      return
    }
    const href = window.prompt('Link to', 'https://')
    if (!href) return
    run('createLink', href)
  }, [run])

  return (
    <div
      className={cn(
        'border-input bg-card focus-within:ring-ring/40 overflow-hidden rounded-[0.875rem] border focus-within:ring-2',
        className
      )}
    >
      <div className="border-input bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton label="Bold" onClick={() => run('bold')}>
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => run('italic')}>
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => run('underline')}>
          <Underline className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          onClick={() => run('strikeThrough')}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>

        <span className="bg-border mx-1 h-4 w-px" />

        <ColorButton
          label="Text colour"
          onPick={(colour) => run('foreColor', colour)}
        />
        <ColorButton
          label="Highlight"
          icon={<Highlighter className="size-3.5" />}
          onPick={(colour) => run('hiliteColor', colour)}
        />

        <span className="bg-border mx-1 h-4 w-px" />

        <select
          aria-label="Font size"
          defaultValue=""
          onChange={(event) => {
            const size = Number(event.target.value)
            event.currentTarget.value = ''
            if (size) setFontSize(size)
          }}
          className="text-muted-foreground hover:text-foreground h-6 rounded bg-transparent px-1 text-xs outline-none"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>

        <ToolbarButton label="Add link" onClick={addLink}>
          <Link2 className="size-3.5" />
        </ToolbarButton>

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

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // The selection is lost the moment the editor blurs, and a plain click
      // blurs it before the handler runs — so the command would apply to
      // nothing. Preventing the default on mousedown keeps focus where it is.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 items-center justify-center rounded"
    >
      {children}
    </button>
  )
}

function ColorButton({
  label,
  icon,
  onPick,
}: {
  label: string
  icon?: React.ReactNode
  onPick: (colour: string) => void
}) {
  return (
    <label
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      className="text-muted-foreground hover:bg-accent hover:text-foreground relative flex size-6 cursor-pointer items-center justify-center rounded"
    >
      {icon ?? <span className="text-[13px] font-bold">A</span>}
      <input
        type="color"
        aria-label={label}
        onChange={(event) => onPick(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}
