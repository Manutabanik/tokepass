import * as Sentry from "@sentry/nextjs"

import { toUserFacingError } from "@/lib/errors/user-facing-error"

export type SentryActionError = { error: string }

type SentryActionTags = Record<string, string | undefined>

function captureActionException(
  actionName: string,
  error: unknown,
  tags?: SentryActionTags,
) {
  const cleaned: Record<string, string> = { serverAction: actionName }
  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      if (!value) continue
      cleaned[key] = value
    }
  }
  Sentry.captureException(error, { tags: cleaned })
}

export function captureServerActionError(
  actionName: string,
  error: unknown,
  tags?: SentryActionTags,
) {
  captureActionException(actionName, error, tags)
}

/**
 * Envuelve una Server Action para reportar excepciones no controladas en Sentry
 * y relanzarlas al caller (útil cuando la acción ya devuelve errores tipados).
 */
export function withSentryAction<TArgs extends unknown[], TResult>(
  actionName: string,
  handler: (...args: TArgs) => Promise<TResult>,
  tags?: SentryActionTags,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (error) {
      captureActionException(actionName, error, tags)
      throw error
    }
  }
}

/**
 * Igual que `withSentryAction`, pero atrapa la excepción y devuelve
 * `{ error: string }` seguro para el cliente.
 */
export function withSentryActionSafe<TArgs extends unknown[], TResult>(
  actionName: string,
  handler: (...args: TArgs) => Promise<TResult>,
  options?: {
    fallbackMessage?: string
    tags?: SentryActionTags
  },
): (...args: TArgs) => Promise<TResult | SentryActionError> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (error) {
      captureActionException(actionName, error, options?.tags)
      return {
        error: toUserFacingError(error, options?.fallbackMessage),
      }
    }
  }
}
