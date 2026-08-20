import type { SupportFaqCategory } from "@/types/database"

export const FAQ_QUESTION_MAX = 180
export const FAQ_ANSWER_MAX = 8000

export const FAQ_CATEGORIES = [
  { id: "ventas", label: "Ventas" },
  { id: "cobros", label: "Cobros" },
  { id: "accesos", label: "Accesos" },
  { id: "equipos", label: "Equipos" },
] as const satisfies ReadonlyArray<{ id: SupportFaqCategory; label: string }>

export type SupportFaqInput = {
  question: string
  answer: string
  category: SupportFaqCategory
  isActive: boolean
  order: number
}

export type SupportFaqParseResult =
  | { ok: true; value: SupportFaqInput }
  | { ok: false; error: string }

function asInt(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.round(parsed)
  }
  return fallback
}

export function isFaqCategory(value: unknown): value is SupportFaqCategory {
  return FAQ_CATEGORIES.some((item) => item.id === value)
}

export function parseFaqCategory(value: unknown): SupportFaqCategory {
  return isFaqCategory(value) ? value : "ventas"
}

export function faqCategoryLabel(category: SupportFaqCategory) {
  return FAQ_CATEGORIES.find((item) => item.id === category)?.label ?? "Ventas"
}

export function parseSupportFaqInput(raw: {
  question?: unknown
  answer?: unknown
  category?: unknown
  isActive?: unknown
  order?: unknown
}): SupportFaqParseResult {
  const question = String(raw.question ?? "").replace(/\s+/g, " ").trim()
  const answer = String(raw.answer ?? "").trim()
  if (question.length < 3) {
    return { ok: false, error: "La pregunta debe tener al menos 3 caracteres." }
  }
  if (question.length > FAQ_QUESTION_MAX) {
    return {
      ok: false,
      error: `La pregunta no puede superar ${FAQ_QUESTION_MAX} caracteres.`,
    }
  }
  if (answer.length < 3) {
    return { ok: false, error: "La respuesta debe tener al menos 3 caracteres." }
  }
  if (answer.length > FAQ_ANSWER_MAX) {
    return {
      ok: false,
      error: `La respuesta no puede superar ${FAQ_ANSWER_MAX} caracteres.`,
    }
  }
  if (raw.category != null && !isFaqCategory(raw.category)) {
    return { ok: false, error: "Elegí una categoría válida." }
  }
  const isActive =
    raw.isActive === true ||
    raw.isActive === "true" ||
    raw.isActive === "on" ||
    raw.isActive === 1
  const order = Math.min(9999, Math.max(0, asInt(raw.order, 0)))
  return {
    ok: true,
    value: {
      question,
      answer,
      category: parseFaqCategory(raw.category),
      isActive,
      order,
    },
  }
}
