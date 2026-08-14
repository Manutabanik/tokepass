export type CheckoutIdentityMode = "undecided" | "guest" | "account"

export function hasCheckoutIdentity(
  currentUserId: string | null | undefined,
  mode: CheckoutIdentityMode,
): boolean {
  return Boolean(currentUserId) || mode === "guest" || mode === "account"
}

/** True when the buyer chose guest and has no logged-in account. */
export function isCheckoutGuest(
  mode: CheckoutIdentityMode,
  currentUserId?: string | null,
  isGuestFlag?: boolean,
): boolean {
  if (currentUserId) return false
  return isGuestFlag === true || mode === "guest"
}

export function needsIdentityChoice(
  currentUserId: string | null | undefined,
  mode: CheckoutIdentityMode,
): boolean {
  return !hasCheckoutIdentity(currentUserId, mode)
}
