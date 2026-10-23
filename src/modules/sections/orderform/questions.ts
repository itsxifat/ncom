import { z } from 'zod'
import type { FormAnswer } from '@/lib/order-form-answers'

/**
 * The merchant's own questions on the order form.
 *
 * Name, phone and address are what a courier needs; they are not everything a
 * shop needs. A clothing page has to know the size, a gift shop the name for
 * the card, a fresh-food page the time someone will be home — and until now
 * every one of those went into the free-text note, if the buyer thought to
 * write it there. These are asked as questions of their own, answered in the
 * form, and copied onto the order with the wording the buyer saw.
 *
 * The schema never fails. The order form is parsed as one object, and a block
 * whose content fails to parse is drawn from its defaults — so a question
 * label typed one character too long in the builder would otherwise put the
 * whole form back to English sample copy on a live Bangla page. Long words are
 * cut instead (`overwrite`, which keeps the limits visible to the AI
 * catalogue), an unknown kind is read as a short answer, and an entry that is
 * not a question at all becomes an empty one, which is never asked.
 */

export const ORDER_QUESTION_KINDS = ['text', 'longtext', 'choice'] as const
export type OrderQuestionKind = (typeof ORDER_QUESTION_KINDS)[number]

export const MAX_ORDER_QUESTIONS = 10
export const MAX_QUESTION_OPTIONS = 12
/** The longest answer kept. A long-answer box is a sentence or two, not a letter. */
export const MAX_ANSWER_LENGTH = 500

/** Plain text, cut to `max` rather than refused. */
function words(max: number) {
  return z
    .string()
    .overwrite((value) => value.slice(0, max))
    .max(max)
}

const EMPTY_QUESTION = {
  id: '',
  label: '',
  kind: 'text' as OrderQuestionKind,
  options: [] as string[],
  required: false,
  placeholder: '',
}

export const orderQuestionSchema = z
  .object({
    /**
     * How an answer names the question it answers. Optional: a question added
     * in the builder or written by an AI often has none, and is given one from
     * its wording — see `withQuestionIds`.
     */
    id: words(40).default(''),
    label: words(120).default(''),
    kind: z.enum(ORDER_QUESTION_KINDS).default('text').catch('text'),
    /** The answers to pick from, for a `choice` question. */
    options: z
      .array(words(80))
      .overwrite((list) => list.slice(0, MAX_QUESTION_OPTIONS))
      .max(MAX_QUESTION_OPTIONS)
      .default([])
      .catch([]),
    required: z.boolean().default(false).catch(false),
    /** A faint example inside an answer box: "e.g. after 6pm". */
    placeholder: words(120).default(''),
  })
  .catch(EMPTY_QUESTION)

export type OrderQuestion = z.infer<typeof orderQuestionSchema>

export const orderQuestionsSchema = z
  .array(orderQuestionSchema)
  .overwrite((list) => withQuestionIds(list.slice(0, MAX_ORDER_QUESTIONS)))
  .max(MAX_ORDER_QUESTIONS)
  .default([])

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

/**
 * Every question with an id of its own, unique on the form.
 *
 * The form a shopper fills in and the check the order route makes of it read
 * the same saved block, separately, and have to agree on which answer belongs
 * to which question. So a missing, malformed or repeated id is replaced by one
 * worked out from the question's wording — never a random one, which the two
 * readings would each roll differently. Worked out from the wording rather
 * than from the position, so a form reordered between a shopper opening the
 * page and pressing the button cannot file their size under "Delivery time":
 * at worst a reworded question is asked again.
 */
export function withQuestionIds<T extends { id: string; label: string }>(
  questions: readonly T[]
): T[] {
  const taken = new Set<string>()
  return questions.map((question) => {
    const own = question.id.trim()
    let id =
      ID_PATTERN.test(own) && !taken.has(own) ? own : wordingId(question.label)
    const base = id
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    taken.add(id)
    return id === question.id ? question : { ...question, id }
  })
}

/** A short, stable id for a question's wording (FNV-1a, base 36). */
function wordingId(label: string): string {
  let hash = 0x811c9dc5
  for (const char of label.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193)
  }
  return `q${(hash >>> 0).toString(36)}`
}

/** A question as the form asks it. */
export interface AskedQuestion {
  id: string
  /** Its place in the block's list — what the editor addresses its label by. */
  index: number
  label: string
  kind: OrderQuestionKind
  /** The answers to pick from — for `choice` only, empty otherwise. */
  options: string[]
  required: boolean
  placeholder: string
}

/**
 * The questions a form actually asks, in order.
 *
 * A question with no words yet is not asked: it is the row a merchant has
 * just added in the panel. A choice question with no options is asked as a
 * short answer — the merchant meant to ask it, and a question the buyer can
 * answer beats one that silently disappears or one that can never be
 * answered.
 */
export function askedQuestions(
  questions: readonly OrderQuestion[] | undefined
): AskedQuestion[] {
  return withQuestionIds(questions ?? []).flatMap((question, index) => {
    const label = question.label.trim()
    if (!label) return []
    const options = [
      ...new Set(question.options.map((option) => option.trim())),
    ].filter(Boolean)
    const kind =
      question.kind === 'choice' && options.length === 0
        ? 'text'
        : question.kind
    return [
      {
        id: question.id,
        index,
        label,
        kind,
        options: kind === 'choice' ? options : [],
        required: question.required,
        placeholder: question.placeholder.trim(),
      },
    ]
  })
}

export type AnswerCheck =
  | { ok: true; answers: FormAnswer[] }
  | { ok: false; reason: 'missing' | 'not-a-choice'; question: string }

/**
 * A buyer's answers, checked against the questions the form asked.
 *
 * The questions come from the saved page, never from the submission, so a
 * request cannot invent a question or skip a required one. Answers to
 * questions the form does not ask are ignored, an answer to a choice question
 * must be one of its options, and what is kept is the question's wording with
 * the answer — the shape `Order.formAnswers` stores.
 */
export function checkAnswers(
  asked: readonly AskedQuestion[],
  given: readonly { id: string; answer: string }[] | undefined
): AnswerCheck {
  const byId = new Map<string, string>()
  for (const entry of given ?? []) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry.answer)
  }

  const answers: FormAnswer[] = []
  for (const question of asked) {
    const answer = (byId.get(question.id) ?? '')
      .trim()
      .slice(0, MAX_ANSWER_LENGTH)
    if (!answer) {
      if (question.required) {
        return { ok: false, reason: 'missing', question: question.label }
      }
      continue
    }
    if (question.kind === 'choice' && !question.options.includes(answer)) {
      return { ok: false, reason: 'not-a-choice', question: question.label }
    }
    answers.push({ question: question.label, answer })
  }
  return { ok: true, answers }
}
