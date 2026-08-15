import { randomBytes } from "node:crypto"

export const GUEST_TICKET_CAP_ERROR =
  "Superaste el límite máximo de entradas permitidas por persona."

export const PAID_TICKET_STATUSES = ["valid", "used", "scanned"] as const

export function generateGuestOrderToken(): string {
  return randomBytes(32).toString("hex")
}

export function isGuestOrderToken(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim())
}

export function guestTicketCapExceeded(
  existingTickets: number,
  requestedQuantity: number,
  maxTicketsPerPerson: number,
): boolean {
  return existingTickets + requestedQuantity > maxTicketsPerPerson
}

export function uniqueTicketCount(ids: Array<{ id: string } | null | undefined>): number {
  return new Set(ids.filter(Boolean).map((row) => row!.id)).size
}

export function guestTicketPath(token: string): string {
  return `/entrada/invitado/${token.trim()}`
}

export function guestTicketUrl(token: string, origin?: string): string {
  const base = (
    origin ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://www.tokepass.com.ar"
  ).replace(/\/$/, "")
  return `${base}${guestTicketPath(token)}`
}
