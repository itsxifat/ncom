/**
 * Reads the JSON out of whatever a merchant pasted back from their AI.
 *
 * Chat assistants rarely answer with bare JSON even when told to: it arrives
 * inside a ```json fence, after a sentence of preamble, with a trailing comma
 * or a `// hero` comment. None of that should be the merchant's problem, so
 * this finds the outermost object, strips comments and trailing commas outside
 * of strings, and only then parses. When it still fails, the message says what
 * to ask the AI for, because "Unexpected token } in JSON at position 4031"
 * means nothing to someone who sells shoes.
 */

export type JsonExtraction =
  { ok: true; value: unknown } | { ok: false; message: string }

export function extractJson(input: string): JsonExtraction {
  const text = input.trim()
  if (!text) return { ok: false, message: 'Paste your AI’s answer first.' }

  const body = fenced(text) ?? outermost(text)
  if (!body) {
    return {
      ok: false,
      message:
        'There is no design in that text. Ask your AI to “reply with only the JSON”, then paste its answer here.',
    }
  }

  const cleaned = stripCommentsAndTrailingCommas(body)
  try {
    return { ok: true, value: JSON.parse(cleaned) }
  } catch {
    if (looksCutOff(cleaned)) {
      return {
        ok: false,
        message:
          'The answer stops halfway — your AI ran out of space. Ask it to “send the whole JSON again in one message”, or to make a shorter page.',
      }
    }
    return {
      ok: false,
      message:
        'The answer isn’t valid JSON. Ask your AI to “check the JSON is valid and send it again”, then paste the new answer.',
    }
  }
}

/** The contents of the first ``` fence holding an object or a list. */
function fenced(text: string): string | null {
  // Any language tag, or none: "```json", "```jsonc", "``` JSON".
  for (const match of text.matchAll(
    /```[ \t]*[A-Za-z0-9]*[ \t]*\r?\n([\s\S]*?)```/g
  )) {
    const inner = match[1]!.trim()
    if (inner.startsWith('{') || inner.startsWith('[')) return inner
  }
  return null
}

/** How many bracketed stretches of an unfenced answer are tried before giving up. */
const MAX_CANDIDATES = 20

/**
 * The JSON in an answer with no fence around it.
 *
 * Prose around the JSON can hold brackets of its own — "Here is the page for
 * [Modhu Ghor]:" — so the answer is read one bracketed stretch at a time, and
 * the first that parses as a design wins: an object with sections or pages,
 * else a list (a bare list of sections). When none does, the stretch handed
 * on is the one whose error is worth showing — one that never closes (the
 * answer was cut off), else the first that is not valid JSON.
 */
function outermost(text: string): string | null {
  const opener = /[{[]/g
  let broken: string | null = null
  let other: string | null = null
  // The first bracket that never closes. Either the answer was cut off — and
  // everything after it is inside the unfinished design — or it is a stray
  // "[" in the prose before a complete design, which the scan must go past
  // rather than stop at.
  let unclosed: string | null = null
  for (let tried = 0; tried < MAX_CANDIDATES; tried++) {
    const match = opener.exec(text)
    if (!match) break
    const start = match.index
    const end = closingIndex(text, start)
    if (end === -1) {
      // JSON opens with a key or a nested bracket; prose ("[Modhu Ghor",
      // ":-[") does not. An unfinished design is reported as cut off at once —
      // reading on would find its first complete page and present that as the
      // whole design.
      if (/^[{[]\s*["{[]/.test(text.slice(start, start + 40))) {
        return text.slice(start)
      }
      unclosed ??= text.slice(start)
      continue
    }
    const body = text.slice(start, end + 1)
    opener.lastIndex = end + 1
    const value = parsed(body)
    if (value === undefined) {
      // An object that is not valid JSON says more than "[Your name]" does.
      if (broken === null || (broken.startsWith('[') && body.startsWith('{')))
        broken = body
      continue
    }
    if (looksLikeDesign(value)) return body
    other ??= body
  }
  // Nothing complete was a design: a bracket that never closed means the
  // design was cut off, which is the message worth showing.
  return unclosed ?? broken ?? other
}

function parsed(body: string): unknown {
  try {
    return JSON.parse(stripCommentsAndTrailingCommas(body))
  } catch {
    return undefined
  }
}

function looksLikeDesign(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => item !== null && typeof item === 'object')
  }
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    Array.isArray(record.sections) ||
    Array.isArray(record.pages) ||
    (Boolean(record.page) && typeof record.page === 'object')
  )
}

/**
 * Where the bracket at `start` is closed, or -1 when it never is. Brackets
 * inside strings and comments do not count. A `//` only starts a comment
 * after a space, a comma or a bracket, so the address in prose such as
 * "[see https://…]" is not read as one.
 */
function closingIndex(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index++) {
    const char = text[index]!
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '/' && /[\s,{}[\]]/.test(text[index - 1] ?? ' ')) {
      if (text[index + 1] === '/') {
        const end = text.indexOf('\n', index)
        if (end === -1) return -1
        index = end
      } else if (text[index + 1] === '*') {
        const end = text.indexOf('*/', index + 2)
        if (end === -1) return -1
        index = end + 1
      }
    } else if (char === '{' || char === '[') {
      depth++
    } else if (char === '}' || char === ']') {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

/**
 * Removes `//` and `/* *\/` comments and commas before a closing bracket,
 * walking the text so nothing inside a string is touched — a URL's `//` and a
 * sentence's comma survive.
 *
 * Whether a comma is a trailing one is decided from what has been written
 * out, not by looking ahead in the source: a comment between the comma and
 * the bracket (`{ "type": "hero" }, // the hero` then `]`) would otherwise
 * hide the bracket and keep the comma.
 */
function stripCommentsAndTrailingCommas(source: string): string {
  const out: string[] = []
  // Where in `out` the last comma is, while nothing but space or comments
  // has followed it.
  let comma = -1
  let inString = false
  let escaped = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    const next = source[index + 1]
    if (inString) {
      out.push(char)
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++
      out.push('\n')
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      )
        index++
      index++
      continue
    }
    if (/\s/.test(char)) {
      out.push(char)
      continue
    }
    if ((char === '}' || char === ']') && comma !== -1) out[comma] = ''
    comma = char === ',' ? out.length : -1
    if (char === '"') inString = true
    out.push(char)
  }
  return out.join('')
}

/** More openers than closers outside strings: the answer was truncated. */
function looksCutOff(source: string): boolean {
  let depth = 0
  let inString = false
  let escaped = false
  for (const char of source) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{' || char === '[') depth++
    else if (char === '}' || char === ']') depth--
  }
  return depth > 0 || inString
}
