export const PRODUCER_FOLLOW_AUTH_REQUIRED = "auth_required"

export function isProducerFollowAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message === PRODUCER_FOLLOW_AUTH_REQUIRED
  }
  return String(error).includes(PRODUCER_FOLLOW_AUTH_REQUIRED)
}
