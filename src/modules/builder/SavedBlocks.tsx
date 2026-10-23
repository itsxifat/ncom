'use client'

import { useState, useTransition } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import { Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { getSectionDefinition } from '../sections/registry'
import type { SectionConfig } from '../sections/types'
import { useBuilderStore, type BuilderSection } from './store'
import { sectionLabel } from './sectionLabel'
import { BlockThumbnail } from './BlockThumbnail'
import {
  deleteSavedBlockAction,
  getSavedBlockAction,
  listSavedBlocksAction,
  renameSavedBlockAction,
  saveBlockAction,
} from './saved-block-actions'
import type {
  SavedBlockCopy,
  SavedBlockSummary,
} from '@/server/services/savedBlockService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Saved blocks: a section saved once, put down again on any page of any site.
 *
 * The library is the workspace's, kept on the server (see savedBlockService)
 * and held here for the builder. It lives outside the builder's own store on
 * purpose: that store's history is the page's, and saving a block to the
 * library is not an edit of the page anyone should be able to undo.
 *
 * The dialogs are driven from here too, and drawn by `SavedBlockDialogs`,
 * which the builder mounts once. They are opened from places that come and
 * go — the toolbar over whichever section the pointer is on, the block
 * library inside a "+" popover — and a dialog drawn by one of those would
 * vanish the moment the pointer moved to another section or the popover
 * closed behind it.
 */

type SavedBlockDialog =
  | {
      kind: 'save'
      id: number
      /** The section as it was when the merchant asked to save it. */
      draft: {
        type: string
        content: Record<string, unknown>
        config: SectionConfig
      }
      name: string
    }
  | { kind: 'rename'; id: number; block: SavedBlockSummary }
  | { kind: 'delete'; id: number; block: SavedBlockSummary }

interface SavedBlocksState {
  /** Null until the list has been loaded once. */
  blocks: SavedBlockSummary[] | null
  dialog: SavedBlockDialog | null
}

export const useSavedBlocks = create<SavedBlocksState>()(() => ({
  blocks: null,
  dialog: null,
}))

let dialogCount = 0
let loading: Promise<void> | null = null

type Fetched =
  { ok: true; block: SavedBlockCopy } | { ok: false; error: string }

/**
 * Saved blocks fetched in full, by id. A saved block never changes after it
 * is saved — only its name does — so a copy fetched once serves every insert
 * after it, and a second click on the same block is instant.
 */
const fetched = new Map<string, Promise<Fetched>>()

/** Loads the library again. Concurrent callers share one request. */
export function refreshSavedBlocks(): Promise<void> {
  loading ??= listSavedBlocksAction()
    .then((result) => {
      if (result.ok) useSavedBlocks.setState({ blocks: result.blocks })
    })
    .catch(() => {
      // The library simply keeps what it showed; the next open asks again.
    })
    .finally(() => {
      loading = null
    })
  return loading
}

/**
 * Starts fetching a saved block's content, ahead of the click that needs it —
 * the library asks as the pointer reaches a tile. Quiet: a hover that fails
 * says nothing, and the click after it asks again and says why.
 */
export function prefetchSavedBlock(id: string): Promise<Fetched> {
  let copy = fetched.get(id)
  if (!copy) {
    copy = getSavedBlockAction(id).catch((): Fetched => ({
      ok: false,
      error: 'Could not add that block.',
    }))
    fetched.set(id, copy)
    void copy.then((result) => {
      if (!result.ok) fetched.delete(id)
    })
  }
  return copy
}

/**
 * Puts a copy of a saved block on the page, at `at` in the builder's list (or
 * at the end of the page) — selected, like any block just added, and scrolled
 * to when `reveal` says the merchant is not already looking at the spot.
 */
export async function insertSavedBlock(
  id: string,
  at?: number,
  { reveal = false }: { reveal?: boolean } = {}
) {
  const result = await prefetchSavedBlock(id)
  if (!result.ok) {
    toast.error(result.error)
    // Most likely deleted from another tab: show the library as it is now.
    void refreshSavedBlocks()
    return
  }
  const { block } = result
  const sectionId = `temp-${crypto.randomUUID()}`
  useBuilderStore.getState().addSection(
    {
      id: sectionId,
      type: block.type,
      content: structuredClone(block.content),
      config: structuredClone(block.config) as SectionConfig,
      isVisible: true,
    },
    at
  )
  if (reveal) useBuilderStore.getState().revealSection(sectionId)
}

/** Opens the dialog that names and saves a section to the library. */
export function openSaveBlock(section: BuilderSection) {
  useSavedBlocks.setState({
    dialog: {
      kind: 'save',
      id: ++dialogCount,
      // Copied now: what is saved is the block as the merchant saw it when
      // they asked, not whatever it has become by the time they press Save.
      draft: {
        type: section.type,
        content: structuredClone(section.content),
        config: structuredClone(section.config ?? {}),
      },
      name: sectionLabel(section).name,
    },
  })
}

export function openRenameSavedBlock(block: SavedBlockSummary) {
  useSavedBlocks.setState({
    dialog: { kind: 'rename', id: ++dialogCount, block },
  })
}

export function openDeleteSavedBlock(block: SavedBlockSummary) {
  useSavedBlocks.setState({
    dialog: { kind: 'delete', id: ++dialogCount, block },
  })
}

function closeDialog() {
  useSavedBlocks.setState({ dialog: null })
}

/**
 * One saved block in the block library: its kind's picture, its name, and a
 * menu to rename or delete it. Inserted by a click or dragged onto the page
 * like any other block.
 */
export function SavedBlockTile({
  block,
  disabled,
  onInsert,
}: {
  block: SavedBlockSummary
  /** Why it cannot go on this page, when it cannot. */
  disabled?: string
  onInsert: () => void
}) {
  const setDraggingBlock = useBuilderStore((s) => s.setDraggingBlock)
  const kind = getSectionDefinition(block.type)?.name ?? block.type
  return (
    <div className="group relative">
      <button
        type="button"
        disabled={Boolean(disabled)}
        draggable={!disabled}
        title={disabled ?? `${block.name} — ${kind}`}
        onClick={onInsert}
        onPointerEnter={() => void prefetchSavedBlock(block.id)}
        onFocus={() => void prefetchSavedBlock(block.id)}
        onDragStart={(event) => {
          // The type travels as the block key the canvas already knows how to
          // catch; the saved block's id travels beside it, and the drop
          // inserts the saved copy instead of a fresh block of that type.
          event.dataTransfer.setData('application/x-ncom-block', block.type)
          event.dataTransfer.setData('application/x-ncom-saved-block', block.id)
          event.dataTransfer.effectAllowed = 'copy'
          setDraggingBlock(block.type)
          void prefetchSavedBlock(block.id)
        }}
        onDragEnd={() => setDraggingBlock(null)}
        className="hover:bg-muted flex w-full cursor-grab flex-col gap-1.5 rounded-lg p-1.5 text-left transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
      >
        <BlockThumbnail
          type={block.type}
          className="group-hover:ring-foreground/30 transition"
        />
        <span className="flex min-w-0 flex-col px-0.5">
          <span className="truncate text-xs font-medium">{block.name}</span>
          <span className="text-muted-foreground truncate text-[11px]">
            {kind}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Options for ${block.name}`}
              title="Rename or delete"
              className="bg-card/90 text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-md opacity-0 shadow-sm ring-1 ring-black/5 transition group-focus-within:opacity-100 group-hover:opacity-100 data-popup-open:opacity-100"
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => openRenameSavedBlock(block)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => openDeleteSavedBlock(block)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Every saved-block dialog, mounted once by the builder. */
export function SavedBlockDialogs() {
  const dialog = useSavedBlocks((s) => s.dialog)
  // The last dialog opened stays drawn while its close animation plays —
  // emptying it at once would flash an empty panel on the way out.
  const [shown, setShown] = useState(dialog)
  if (dialog && dialog !== shown) setShown(dialog)

  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) closeDialog()
      }}
    >
      <DialogContent>
        {shown?.kind === 'save' && <SaveForm key={shown.id} dialog={shown} />}
        {shown?.kind === 'rename' && (
          <RenameForm key={shown.id} block={shown.block} />
        )}
        {shown?.kind === 'delete' && (
          <DeleteConfirm key={shown.id} block={shown.block} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SaveForm({
  dialog,
}: {
  dialog: Extract<SavedBlockDialog, { kind: 'save' }>
}) {
  const [name, setName] = useState(dialog.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      setError(null)
      const result = await saveBlockAction({ name, ...dialog.draft })
      if (!result.ok) {
        setError(result.error)
        return
      }
      useSavedBlocks.setState((state) => ({
        blocks: [result.block, ...(state.blocks ?? [])],
        dialog: null,
      }))
      toast.success('Saved. Find it under Add → Saved blocks.')
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Save as a reusable block</DialogTitle>
        <DialogDescription>
          Put it on any page of any of your sites from Add → Saved blocks. Each
          page gets its own copy, so changing one never changes another.
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoFocus
          placeholder="e.g. Delivery terms strip"
        />
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={closeDialog}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          Save block
        </Button>
      </div>
    </form>
  )
}

function RenameForm({ block }: { block: SavedBlockSummary }) {
  const [name, setName] = useState(block.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function rename(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      setError(null)
      const result = await renameSavedBlockAction(block.id, name)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const clean = name.replace(/\s+/g, ' ').trim()
      useSavedBlocks.setState((state) => ({
        blocks: (state.blocks ?? []).map((candidate) =>
          candidate.id === block.id ? { ...candidate, name: clean } : candidate
        ),
        dialog: null,
      }))
    })
  }

  return (
    <form onSubmit={rename} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Rename saved block</DialogTitle>
      </DialogHeader>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        autoFocus
        aria-label="Name"
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={closeDialog}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          Rename
        </Button>
      </div>
    </form>
  )
}

function DeleteConfirm({ block }: { block: SavedBlockSummary }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function remove() {
    startTransition(async () => {
      setError(null)
      const result = await deleteSavedBlockAction(block.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      fetched.delete(block.id)
      useSavedBlocks.setState((state) => ({
        blocks: (state.blocks ?? []).filter(
          (candidate) => candidate.id !== block.id
        ),
        dialog: null,
      }))
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Delete “{block.name}”?</DialogTitle>
        <DialogDescription>
          It leaves your saved blocks. Pages you already put it on keep their
          copy.
        </DialogDescription>
      </DialogHeader>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={closeDialog}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={remove}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Delete
        </Button>
      </div>
    </div>
  )
}

/** Whether a saved block matches what was typed in the library's search. */
export function savedBlockMatches(block: SavedBlockSummary, needle: string) {
  if (!needle) return true
  const definition = getSectionDefinition(block.type)
  return [block.name, definition?.name ?? '', ...(definition?.keywords ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}
