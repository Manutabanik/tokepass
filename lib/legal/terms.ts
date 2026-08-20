export const EVENT_LEGAL_TERMS_VERSION = "AR-EVENT-B2C-2026-07-30"

/** Clickwrap de cesion P2P y reventa oficial. */
export const TICKET_TRANSFER_RESALE_TERMS_VERSION =
  "AR-TICKET-XFER-RESALE-2026-08-19"

export const TICKET_SHARE_TRANSFER_TTL_HOURS = 24

export const LEGAL_CONSENT_REQUIRED_ERROR =
  "Debés aceptar los términos y condiciones para continuar."

export type LegalConsentInput = {
  termsAccepted: boolean
}

export type OrganizerLegalIdentity = {
  legalName: string
  taxId: string | null
  isComplete: boolean
}
