import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { getSectionDefinition } from '@/modules/sections/registry'

/**
 * Blocks a merchant saved to use again — see `SavedBlock` in the schema.
 *
 * A saved block is a copy of one section as it stood when it was saved: its
 * type, its content and its design. Inserting one copies it back onto a page,
 * so nothing here ever reaches into a page, and deleting a saved block leaves
 * every page that used it exactly as it is.
 */

/** How many a workspace can keep. Far past any real library of sections. */
export const MAX_SAVED_BLOCKS = 200

/** The longest name a saved block takes, as the library has room to show. */
export const MAX_SAVED_BLOCK_NAME = 80

/**
 * The most a saved block may weigh, content and design together, as JSON.
 *
 * A custom-code design runs to 60KB of markup and 30KB of CSS, and a block's
 * per-element design adds a little on top; this leaves that room with some to
 * spare while keeping one row from becoming a dumping ground.
 */
const MAX_SAVED_BLOCK_BYTES = 200_000

/** One saved block in the library's list: enough to show and filter it. */
export interface SavedBlockSummary {
  id: string
  name: string
  /** The block type, a key of the section registry. */
  type: string
  createdAt: string
}

/** One saved block in full, ready to be copied onto a page. */
export interface SavedBlockCopy extends SavedBlockSummary {
  content: Record<string, unknown>
  config: Record<string, unknown>
}

export class SavedBlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SavedBlockError'
  }
}

export async function listSavedBlocks(
  organizationId: string
): Promise<SavedBlockSummary[]> {
  await requireOrgAccess(organizationId, 'VIEWER')
  const rows = await prisma.savedBlock.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: MAX_SAVED_BLOCKS,
    select: { id: true, name: true, type: true, createdAt: true },
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function getSavedBlock(
  organizationId: string,
  id: string
): Promise<SavedBlockCopy> {
  await requireOrgAccess(organizationId, 'VIEWER')
  const row = await prisma.savedBlock.findFirst({
    where: { id, organizationId },
  })
  if (!row) throw new SavedBlockError('That saved block no longer exists.')
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    content: asRecord(row.content),
    config: asRecord(row.config),
  }
}

/**
 * Saves a copy of a section.
 *
 * The content is read through the block's own schema and stored as it parses,
 * the same reading the page renderer gives it, so a saved block is always one
 * the library can insert and the canvas can draw. A content the schema refuses
 * is refused here rather than saved to fail later, somewhere else.
 */
export async function createSavedBlock(
  organizationId: string,
  input: {
    name: string
    type: string
    content: unknown
    config: unknown
  }
): Promise<SavedBlockSummary> {
  const { session } = await requireOrgAccess(organizationId, 'EDITOR')

  const definition = getSectionDefinition(input.type)
  if (!definition) throw new SavedBlockError('That kind of block is unknown.')
  if (definition.placement) {
    throw new SavedBlockError(
      'Your header, footer and announcement bar are shared by every page already.'
    )
  }

  const parsed = definition.schema.safeParse(input.content)
  if (!parsed.success) {
    throw new SavedBlockError(
      'This block has something it cannot save. Check its settings and try again.'
    )
  }
  const content = parsed.data as object
  const config: object = asRecord(input.config)
  if (
    JSON.stringify(content).length + JSON.stringify(config).length >
    MAX_SAVED_BLOCK_BYTES
  ) {
    throw new SavedBlockError('This block is too big to save.')
  }

  const count = await prisma.savedBlock.count({ where: { organizationId } })
  if (count >= MAX_SAVED_BLOCKS) {
    throw new SavedBlockError(
      `You have ${MAX_SAVED_BLOCKS} saved blocks. Delete some you no longer use to save more.`
    )
  }

  const row = await prisma.savedBlock.create({
    data: {
      organizationId,
      name: cleanName(input.name) ?? definition.name,
      type: definition.key,
      content,
      config,
      // Null for an API key: a machine is not a person to credit it to.
      createdById: session?.user.id ?? null,
    },
    select: { id: true, name: true, type: true, createdAt: true },
  })
  return { ...row, createdAt: row.createdAt.toISOString() }
}

export async function renameSavedBlock(
  organizationId: string,
  id: string,
  name: string
): Promise<void> {
  await requireOrgAccess(organizationId, 'EDITOR')
  const clean = cleanName(name)
  if (!clean) throw new SavedBlockError('Give the block a name.')
  const { count } = await prisma.savedBlock.updateMany({
    where: { id, organizationId },
    data: { name: clean },
  })
  if (count === 0) {
    throw new SavedBlockError('That saved block no longer exists.')
  }
}

/** Deletes a saved block. Pages it was inserted on keep their copies. */
export async function deleteSavedBlock(
  organizationId: string,
  id: string
): Promise<void> {
  await requireOrgAccess(organizationId, 'EDITOR')
  await prisma.savedBlock.deleteMany({ where: { id, organizationId } })
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_SAVED_BLOCK_NAME)
  return name || null
}

/** A JSON value as a plain object, or an empty one when it is anything else. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
