import {
  APP_ERRORS,
  FIELD_REVIEW_HINT,
  type AppError,
  type AppErrorCode,
} from "@/lib/errors/app-error"

export { FIELD_REVIEW_HINT }

const FORBIDDEN_USER_COPY =
  /^(unknown|error\s*500|internal server error|500)$/i

export function isForbiddenUserCopy(text: string): boolean {
  return FORBIDDEN_USER_COPY.test(text.trim())
}

export function fieldFromAppError(error: Pick<AppError, "field" | "action" | "code">): string | undefined {
  return error.field || error.action?.field || APP_ERRORS[error.code as AppErrorCode]?.field
}

export function focusInvalidFormField(field?: string | null) {
  if (typeof document === "undefined") return
  const name = field?.trim()
  if (!name) return
  const escaped = CSS.escape(name)
  const target = document.querySelector<HTMLElement>(
    `[name="${escaped}"], [id="${escaped}"], [data-field="${escaped}"]`,
  )
  if (!target) return
  target.scrollIntoView({ behavior: "smooth", block: "center" })
  target.setAttribute("aria-invalid", "true")
  target.classList.add("ring-2", "ring-red-500", "border-red-500")
  window.setTimeout(() => {
    target.focus({ preventScroll: true })
  }, 80)
}
