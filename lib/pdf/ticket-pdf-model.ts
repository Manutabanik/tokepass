import { formatCurrency, formatDateTime, formatEventDay, formatEventTime } from "@/lib/format"
import {
  ticketOrderIdShort,
  ticketPaymentPrintLabel,
  ticketPrintCode,
} from "@/lib/ticket-print"
import { ticketSectorLabel } from "@/lib/ticket-stub"

export const TICKET_PDF_SIZES = ["80mm", "58mm", "a4"] as const
export type TicketPdfSize = (typeof TICKET_PDF_SIZES)[number]

export const TICKET_PDF_MAX_BATCH = 40

/** 80 mm en puntos PDF (72 pt = 1 in). */
export const THERMAL_80_WIDTH_PT = 226.77
/** 58 mm en puntos PDF. */
export const THERMAL_58_WIDTH_PT = 164.4

export const THERMAL_80_PAGE_SIZE: [number, "auto"] = [THERMAL_80_WIDTH_PT, "auto"]
export const THERMAL_58_PAGE_SIZE: [number, "auto"] = [THERMAL_58_WIDTH_PT, "auto"]

export type TicketPdfAudit = {
  orderId: string | null
  paymentMethod: string | null
  issuedAt: string | null
}

export type TicketPdfSource = {
  id: string
  qrPayload: string
  eventTitle: string
  eventDate: string
  eventLocation: string | null
  tierName: string
  holderName: string
  holderDni: string | null
  tierPrice: number | null
  flyerUrl: string | null
  sectorLabel: string | null
  seatingLabel: string | null
  isTest: boolean
}

export type ThermalTicketPdfModel = {
  ticketId: string
  eventName: string
  eventFlyerSrc: string | null
  ticketTierName: string
  sectorName: string | null
  eventDateFormatted: string
  eventLocationName: string
  qrDataUri: string
  qrPayload: string
  ticketCode: string
  ticketPrice: string | null
  paymentMethod: string | null
  customerName: string
  customerDni: string | null
  issueDateFormatted: string | null
  orderIdShort: string | null
  isTest: boolean
}

export function parseTicketPdfSize(value: string | null | undefined): TicketPdfSize {
  if (value === "58mm" || value === "a4" || value === "80mm") return value
  return "80mm"
}

export function parseTicketPdfIds(
  pathId: string,
  idsParam: string | null | undefined,
): string[] {
  const primary = pathId.trim()
  const extras = (idsParam ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const unique = [...new Set([primary, ...extras].filter(Boolean))]
  return unique.slice(0, TICKET_PDF_MAX_BATCH)
}

export function ticketPdfPath(
  ticketId: string,
  options?: {
    size?: TicketPdfSize
    ids?: string[]
    download?: boolean
  },
): string {
  const params = new URLSearchParams()
  const size = options?.size ?? "80mm"
  if (size !== "80mm") params.set("size", size)
  const extras = (options?.ids ?? []).filter((id) => id && id !== ticketId)
  if (extras.length > 0) {
    params.set("ids", [ticketId, ...extras].join(","))
  }
  if (options?.download) params.set("download", "1")
  const query = params.toString()
  return `/api/tickets/${encodeURIComponent(ticketId)}/pdf${query ? `?${query}` : ""}`
}

export function ticketPdfSectorName(ticket: TicketPdfSource): string | null {
  const sector = ticketSectorLabel({
    seatingSectorName: ticket.sectorLabel,
    seatingLabel: ticket.seatingLabel,
    tierName: ticket.tierName,
  })
  if (ticket.seatingLabel && ticket.seatingLabel !== ticket.tierName) {
    return ticket.seatingLabel
  }
  if (sector !== ticket.tierName.trim().toUpperCase()) return sector
  return null
}

export function mapPrintableTicketToPdfModel(
  ticket: TicketPdfSource,
  audit: TicketPdfAudit,
  assets: { qrDataUri: string; eventFlyerSrc: string | null },
): ThermalTicketPdfModel {
  const day = ticket.eventDate ? formatEventDay(ticket.eventDate) : ""
  const time = ticket.eventDate ? formatEventTime(ticket.eventDate) : ""
  const eventDateFormatted = [day, time].filter(Boolean).join("  ")

  return {
    ticketId: ticket.id,
    eventName: ticket.eventTitle,
    eventFlyerSrc: assets.eventFlyerSrc,
    ticketTierName: ticket.tierName,
    sectorName: ticketPdfSectorName(ticket),
    eventDateFormatted,
    eventLocationName: (ticket.eventLocation ?? "").trim() || "Online",
    qrDataUri: assets.qrDataUri,
    qrPayload: ticket.qrPayload,
    ticketCode: ticketPrintCode(ticket.id),
    ticketPrice:
      ticket.tierPrice != null ? formatCurrency(ticket.tierPrice) : null,
    paymentMethod: ticketPaymentPrintLabel(audit.paymentMethod),
    customerName: ticket.holderName,
    customerDni: ticket.holderDni,
    issueDateFormatted: audit.issuedAt ? formatDateTime(audit.issuedAt) : null,
    orderIdShort: ticketOrderIdShort(audit.orderId),
    isTest: ticket.isTest,
  }
}

export function ticketPdfFilename(ticketId: string): string {
  const code = ticketPrintCode(ticketId).replace("#", "")
  return `ticket-${code || ticketId.slice(0, 8)}.pdf`
}
