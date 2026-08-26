import { ZodError } from "zod"

import {
  DRAFT_SAVE_TIMEOUT_MESSAGE,
  isDraftPersistTimeoutError,
} from "@/lib/events/editor-v2-ux"
import { seatingPersistUserMessage } from "@/lib/events/sanitize-ticket-tiers"
import { containsInternalErrorCode } from "@/lib/errors/error-handler"
import { formatSupabaseError } from "@/lib/errors/supabase-error"

export type PersistErrorSource = "zod" | "sql" | "network" | "app"

export const PERSIST_ERROR_TITLES: Record<PersistErrorSource, string> = {
  zod: "Error de validación",
  sql: "Error de base de datos",
  network: "Error de red",
  app: "No se pudo guardar",
}

export const NETWORK_SAVE_MESSAGE =
  "No pudimos conectar con el servidor. Recargá la página e intentá de nuevo."

const NETWORK_RE =
  /failed to fetch|networkerror|err_network|err_name_not_resolved|econnrefused|etimedout|enotfound|fetch failed|load failed|network request failed|the internet connection appears|sin conexi[oó]n|abort(?:ed)?|the operation was aborted/i
const SQL_RE =
  /\b(PGRST\d+|22P02|23503|23505|23514|23P01|40001|42501|42703|42P01|P0001)\b|column ["']|violates (unique|foreign|check|not-null)|relation ["']|schema cache|SQLSTATE|duplicate key|postgrest|postgres(?:ql)?/i

type ZodLikeError = {
  name?: string
  issues: Array<{ message?: string }>
  flatten?: () => unknown
}

export function isZodLikeError(error: unknown): error is ZodLikeError {
  if (error instanceof ZodError) return true
  if (!error || typeof error !== "object") return false
  const record = error as { name?: unknown; issues?: unknown }
  return record.name === "ZodError" && Array.isArray(record.issues)
}

function persistErrorText(error: unknown): string {
  if (error == null) return ""
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown; details?: unknown }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error
    }
    if (typeof record.details === "string" && record.details.trim()) {
      return record.details
    }
  }
  return String(error)
}

export function classifyPersistError(error: unknown): PersistErrorSource {
  if (isZodLikeError(error)) return "zod"
  const text = persistErrorText(error)
  if (NETWORK_RE.test(text)) return "network"
  if (error instanceof TypeError && /fetch/i.test(error.message)) return "network"
  if (SQL_RE.test(text)) return "sql"
  if (containsInternalErrorCode(text) && /supabase|postgrest|postgres|PGRST|SQLSTATE/i.test(text)) {
    return "sql"
  }
  return "app"
}

export function persistErrorLogLabel(source: PersistErrorSource): string {
  if (source === "zod") return "ZOD_ERROR"
  if (source === "sql") return "SQL_ERROR"
  if (source === "network") return "NETWORK_ERROR"
  return "PERSIST_ERROR"
}

export function persistErrorUserMessage(
  error: unknown,
  fallback = "No se pudieron guardar los cambios.",
): string {
  if (isDraftPersistTimeoutError(error)) {
    return DRAFT_SAVE_TIMEOUT_MESSAGE
  }
  if (isZodLikeError(error)) {
    const first = error.issues[0]?.message?.trim()
    if (first) return first
  }
  const seatingMessage = seatingPersistUserMessage(error)
  if (seatingMessage) return seatingMessage
  if (classifyPersistError(error) === "network") return NETWORK_SAVE_MESSAGE
  const formatted = formatSupabaseError(error)
  return formatted || fallback
}

export function logPersistError(context: string, error: unknown): PersistErrorSource {
  const source = classifyPersistError(error)
  const label = persistErrorLogLabel(source)
  console.error(`[${label}] ${context}`, error)
  if (isZodLikeError(error) && typeof error.flatten === "function") {
    console.error(`[${label}] ${context} issues`, error.flatten())
  }
  return source
}
