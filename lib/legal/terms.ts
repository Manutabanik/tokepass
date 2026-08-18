export const EVENT_LEGAL_TERMS_VERSION = "AR-EVENT-B2C-2026-07-30"

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
