import { FIELD_REVIEW_HINT, type AppError } from "@/lib/errors/app-error"

export type GuidedActionError = {
  field?: string
  message: string
  actionHint: string
}

export type GuidedActionFailure = {
  success: false
  error: string
  field?: string
  actionHint?: string
}

export function actionHintFromError(error: Pick<AppError, "actionHint" | "message">) {
  return error.actionHint?.trim() || FIELD_REVIEW_HINT
}

export function guidedActionFailure(
  message: string,
  extras?: { field?: string; actionHint?: string },
): GuidedActionFailure {
  return {
    success: false,
    error: message,
    ...(extras?.field ? { field: extras.field } : {}),
    actionHint: extras?.actionHint?.trim() || FIELD_REVIEW_HINT,
  }
}
