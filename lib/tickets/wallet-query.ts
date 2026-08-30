/** tickets.tier_id → ticket_tiers.id. Not source_combo_tier_id (p181). */
export const TICKETS_TIER_FK = "tickets_tier_id_fkey"

export function ticketsTierSelect(columns: string): string {
  return `ticket_tiers!${TICKETS_TIER_FK}(${columns})`
}

export function isAmbiguousTicketRelationshipError(
  message: string | null | undefined,
): boolean {
  if (!message) return false
  return /more than one relationship was found|PGRST201/i.test(message)
}

/** PostgREST / Postgres errors that mean the wallet select is ahead of the schema. */
export function isMissingTicketWalletColumnError(
  message: string | null | undefined,
): boolean {
  if (!message) return false
  return /delivery_mode|access_link|schema cache|PGRST204|42703|bonus_reward|day_id|social_share_image_url|is_sponsored_by_tokepass|ends_at|checkout_message/i.test(
    message,
  )
}

/** Never surface PostgREST / SQL text in Mis entradas. */
export function walletFriendlyLoadError(
  error: unknown,
): string | null {
  if (!(error instanceof Error)) return null
  if (error.message === "auth_required") return "auth_required"
  if (
    isAmbiguousTicketRelationshipError(error.message) ||
    isMissingTicketWalletColumnError(error.message) ||
    /PGRST|embed|schema cache|42703|Could not/i.test(error.message)
  ) {
    return null
  }
  return null
}
