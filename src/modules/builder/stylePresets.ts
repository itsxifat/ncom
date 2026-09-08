'use client'

import type { ElementDesign } from '../sections/elementStyle'

/**
 * Saved element styles a merchant can reapply.
 *
 * Kept in `localStorage` rather than in the database, and that is a deliberate
 * scoping decision rather than an oversight. A preset is a working habit —
 * "my big headline", "my ghost button" — not part of what a page *is*: it is
 * never published, never versioned with a page, and a page that references one
 * would be a page whose appearance depended on a row nothing else points at.
 * Storing it locally keeps presets out of the page snapshot entirely.
 *
 * The consequence, and the reason it is written down here: presets live in one
 * browser. A merchant who switches machines does not bring them along. If they
 * should follow the account, this moves to a table keyed by organisation and
 * the shape below becomes the row — nothing above this module would change.
 */

const STORAGE_KEY = 'ncom:builder:style-presets'
const MAX_PRESETS = 40

export interface StylePreset {
  id: string
  name: string
  design: ElementDesign
}

export function loadPresets(): StylePreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is StylePreset =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as StylePreset).id === 'string' &&
        typeof (entry as StylePreset).name === 'string' &&
        !!(entry as StylePreset).design
    )
  } catch {
    // Storage can throw outright — a private window, storage disabled by
    // policy, or a quota error. None of that should take the builder down, so
    // the feature degrades to "no presets" rather than failing the panel.
    return []
  }
}

function persist(presets: StylePreset[]): StylePreset[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // Same reasoning as above: a preset that could not be saved is a preset
    // that does not exist, which is survivable. Losing the edit that was being
    // made at the time is not.
  }
  return presets
}

export function savePreset(name: string, design: ElementDesign): StylePreset[] {
  const preset: StylePreset = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 60) || 'Untitled style',
    design: structuredClone(design),
  }
  // Newest first, and capped: this is a convenience list someone scans, and an
  // unbounded one would both fill storage and stop being scannable.
  return persist([preset, ...loadPresets()].slice(0, MAX_PRESETS))
}

export function deletePreset(id: string): StylePreset[] {
  return persist(loadPresets().filter((preset) => preset.id !== id))
}
