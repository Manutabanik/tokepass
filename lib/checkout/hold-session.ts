const HOLD_SESSION_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isCheckoutHoldSessionId(
  value: string | null | undefined,
): value is string {
  return Boolean(value && HOLD_SESSION_RE.test(value.trim()))
}

export function normalizeCheckoutHoldSessionId(
  value: string | null | undefined,
): string | null {
  const session = value?.trim() ?? ""
  return isCheckoutHoldSessionId(session) ? session : null
}
