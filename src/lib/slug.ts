export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Appends a short random suffix, for use when a base slug collides. */
export function withRandomSuffix(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base}-${suffix}`
}
