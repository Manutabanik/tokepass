import type { FieldErrors, FieldPath, FieldValues, UseFormSetError } from "react-hook-form"

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

export function applyZodIssuesToForm<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
) {
  for (const issue of issues) {
    const path = issue.path.map(String).join(".")
    if (!path) continue
    setError(path as FieldPath<TFieldValues>, {
      type: "manual",
      message: issue.message,
    })
  }
}

export function firstFieldErrorPath(errors: FieldErrors): string | null {
  function walk(node: unknown, prefix: string[]): string | null {
    if (!node || typeof node !== "object") return null
    const record = node as Record<string, unknown>
    if (typeof record.message === "string" && record.message && prefix.length > 0) {
      return prefix.join(".")
    }
    const root = record.root
    if (
      root &&
      typeof root === "object" &&
      typeof (root as { message?: string }).message === "string" &&
      (root as { message: string }).message &&
      prefix.length > 0
    ) {
      return prefix.join(".")
    }
    for (const [key, value] of Object.entries(record)) {
      if (
        key === "message" ||
        key === "type" ||
        key === "ref" ||
        key === "types" ||
        key === "root"
      ) {
        continue
      }
      const found = walk(value, [...prefix, key])
      if (found) return found
    }
    return null
  }
  return walk(errors, [])
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
