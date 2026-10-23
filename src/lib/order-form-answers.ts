/**
 * What a buyer answered to a merchant's own order-form questions, as it is
 * stored on the order (`Order.formAnswers`).
 *
 * The question is stored as the words the buyer was shown, not as a reference
 * to the form: a merchant rewords and removes questions while a campaign runs,
 * and the order has to keep saying what this buyer was actually asked.
 */
export interface FormAnswer {
  question: string
  answer: string
}

/**
 * The answers on an order, read defensively.
 *
 * The column is JSON, so what comes back is whatever was written — today
 * always the shape above, but an order outlives the code that placed it. An
 * entry that is not a question with an answer is skipped rather than shown as
 * "undefined" on the merchant's screen.
 */
export function readFormAnswers(value: unknown): FormAnswer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { question, answer } = entry as Record<string, unknown>
    if (typeof question !== 'string' || typeof answer !== 'string') return []
    return answer.trim() ? [{ question, answer }] : []
  })
}
