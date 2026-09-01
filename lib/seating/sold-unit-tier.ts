/** Issued inventory keeps its original ticket tier after a map recategorize. */
export function seatingUnitKeepsIssuedTier(
  status: string | null | undefined,
): boolean {
  return status === "sold" || status === "reserved"
}

export function resolveSeatingUnitTierId(input: {
  status: string | null | undefined
  existingTierId: string
  incomingTierId: string
}): string {
  if (seatingUnitKeepsIssuedTier(input.status)) return input.existingTierId
  return input.incomingTierId
}
