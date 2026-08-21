import { randomBytes, randomUUID } from "node:crypto"

export type PaidTicketQrRow = {
  id: string
  qr_code?: string | null
  totp_secret?: string | null
  is_dynamic_qr?: boolean | null
  status?: string | null
  events?: {
    qr_type?: string | null
    delivery_mode?: string | null
  } | null
}

export function newDoorTotpSecret(): string {
  return randomBytes(24).toString("hex")
}

export function needsDynamicQrSecret(row: PaidTicketQrRow): boolean {
  if (row.status && row.status !== "valid") return false
  const delivery = String(row.events?.delivery_mode ?? "PRESENCIAL")
  if (delivery === "ONLINE") return false
  return !row.qr_code?.trim() || !row.totp_secret?.trim()
}

export function buildDynamicQrPatch(row: PaidTicketQrRow): {
  qr_code: string
  totp_secret: string
  is_dynamic_qr: boolean
} | null {
  if (!needsDynamicQrSecret(row)) return null
  return {
    qr_code: row.qr_code?.trim() || randomUUID(),
    totp_secret: row.totp_secret?.trim() || newDoorTotpSecret(),
    is_dynamic_qr: row.is_dynamic_qr !== false,
  }
}
