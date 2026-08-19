import type { MyTicket } from "@/app/actions/tickets"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { getSeoOrigin, toArgentinaIso8601 } from "@/lib/seo/site"
import { signedDoorQrOrFallback } from "@/lib/totp-offline"

export const WALLET_BG = "#090014"
export const WALLET_FG = "#fafafa"
export const WALLET_ACCENT = "#e879f9"
export const WALLET_BG_RGB = "rgb(9, 0, 20)"
export const WALLET_FG_RGB = "rgb(250, 250, 250)"
export const WALLET_ACCENT_RGB = "rgb(232, 121, 249)"

export type WalletPassFields = {
  ticketId: string
  serialNumber: string
  eventId: string
  eventTitle: string
  holderName: string
  venueName: string
  location: string
  tierName: string
  seatingLabel: string | null
  eventDateIso: string
  eventDayLabel: string
  eventTimeLabel: string
  barcodeValue: string
  barcodeAlt: string
  flyerUrl: string | null
  organizationName: string
  logoUrl: string
}

export function walletBarcodeValue(ticket: Pick<MyTicket, "totpSecret" | "qrCode" | "id">): string {
  const id = ticket.id?.trim() ?? ""
  const stored = ticket.qrCode?.trim() ?? ""
  if (
    stored.startsWith("TPS.") ||
    stored.startsWith("TP2.")
  ) {
    return stored
  }
  const signed = signedDoorQrOrFallback(id, ticket.totpSecret)
  if (signed && signed !== id) return signed
  if (stored) return stored
  return id
}

export function walletSeatingLabel(ticket: Pick<
  MyTicket,
  "seatingSectorName" | "seatingLabel" | "seatingRowLabel"
>): string | null {
  const parts = [
    ticket.seatingSectorName,
    ticket.seatingLabel,
    ticket.seatingRowLabel ? `Fila ${ticket.seatingRowLabel}` : null,
  ].filter((value): value is string => Boolean(value?.trim()))
  return parts.length > 0 ? parts.join(" · ") : null
}

export function walletGoogleId(issuerId: string, suffix: string): string {
  const cleanIssuer = issuerId.trim()
  const cleanSuffix = suffix.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${cleanIssuer}.${cleanSuffix}`
}

export function buildWalletPassFields(ticket: MyTicket): WalletPassFields {
  const origin = getSeoOrigin()
  const seating = walletSeatingLabel(ticket)
  const venue = ticket.venueName?.trim() || ticket.eventLocation
  const barcode = walletBarcodeValue(ticket)

  return {
    ticketId: ticket.id,
    serialNumber: ticket.id,
    eventId: ticket.eventId,
    eventTitle: ticket.eventTitle,
    holderName: ticket.holderName?.trim() || "Titular",
    venueName: venue,
    location: ticket.eventLocation,
    tierName: seating ? `${ticket.tierName} · ${seating}` : ticket.tierName,
    seatingLabel: seating,
    eventDateIso: toArgentinaIso8601(ticket.eventDate),
    eventDayLabel: formatEventDay(ticket.eventDate),
    eventTimeLabel: formatEventTime(ticket.eventDate),
    barcodeValue: barcode,
    barcodeAlt: ticket.id.slice(0, 8).toUpperCase(),
    flyerUrl: ticket.flyerUrl?.trim() || ticket.socialShareImageUrl?.trim() || null,
    organizationName: "TokePass",
    logoUrl: `${origin}/brand/tokepass-mark.png`,
  }
}

export function buildApplePassJson(
  fields: WalletPassFields,
  ids: { passTypeIdentifier: string; teamIdentifier: string },
) {
  return {
    formatVersion: 1 as const,
    passTypeIdentifier: ids.passTypeIdentifier,
    serialNumber: fields.serialNumber,
    teamIdentifier: ids.teamIdentifier,
    organizationName: fields.organizationName,
    description: fields.eventTitle,
    logoText: "TokePass",
    backgroundColor: WALLET_BG_RGB,
    foregroundColor: WALLET_FG_RGB,
    labelColor: WALLET_ACCENT_RGB,
    relevantDate: fields.eventDateIso || undefined,
    groupingIdentifier: fields.eventId,
    eventTicket: {
      headerFields: [],
      backFields: [],
      primaryFields: [
        {
          key: "event",
          label: "EVENTO",
          value: fields.eventTitle,
        },
      ],
      secondaryFields: [
        {
          key: "holder",
          label: "ASISTENTE",
          value: fields.holderName,
        },
        {
          key: "when",
          label: "FECHA",
          value: `${fields.eventDayLabel} · ${fields.eventTimeLabel}`.trim(),
        },
      ],
      auxiliaryFields: [
        {
          key: "venue",
          label: "LUGAR",
          value: fields.venueName,
        },
        {
          key: "tier",
          label: "ACCESO",
          value: fields.tierName,
        },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR" as const,
        message: fields.barcodeValue,
        messageEncoding: "iso-8859-1",
        altText: fields.barcodeAlt,
      },
    ],
  }
}

export function buildGoogleWalletResources(
  fields: WalletPassFields,
  issuerId: string,
  classSuffix?: string | null,
) {
  const classId = walletGoogleId(
    issuerId,
    classSuffix?.trim() || `event_${fields.eventId}`,
  )
  const objectId = walletGoogleId(issuerId, `ticket_${fields.ticketId}`)

  const eventTicketClass: {
    id: string
    issuerName: string
    reviewStatus: string
    hexBackgroundColor: string
    eventName: { defaultValue: { language: string; value: string } }
    venue: {
      name: { defaultValue: { language: string; value: string } }
      address: { defaultValue: { language: string; value: string } }
    }
    dateTime?: { start: string }
    logo: {
      sourceUri: { uri: string }
      contentDescription: { defaultValue: { language: string; value: string } }
    }
    heroImage?: { sourceUri: { uri: string } }
  } = {
    id: classId,
    issuerName: "TokePass",
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: WALLET_BG,
    eventName: {
      defaultValue: { language: "es-AR", value: fields.eventTitle },
    },
    venue: {
      name: { defaultValue: { language: "es-AR", value: fields.venueName } },
      address: { defaultValue: { language: "es-AR", value: fields.location } },
    },
    dateTime: fields.eventDateIso ? { start: fields.eventDateIso } : undefined,
    logo: {
      sourceUri: { uri: fields.logoUrl },
      contentDescription: {
        defaultValue: { language: "es-AR", value: "TokePass" },
      },
    },
  }

  if (fields.flyerUrl && /^https:\/\//i.test(fields.flyerUrl)) {
    eventTicketClass.heroImage = { sourceUri: { uri: fields.flyerUrl } }
  }

  const eventTicketObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    hexBackgroundColor: WALLET_BG,
    ticketHolderName: fields.holderName,
    ticketNumber: fields.barcodeAlt,
    ticketType: {
      defaultValue: { language: "es-AR", value: fields.tierName },
    },
    barcode: {
      type: "QR_CODE",
      value: fields.barcodeValue,
      alternateText: fields.barcodeAlt,
    },
    ...(fields.seatingLabel
      ? {
          seatInfo: {
            seat: {
              defaultValue: { language: "es-AR", value: fields.seatingLabel },
            },
          },
        }
      : {}),
  }

  return { classId, objectId, eventTicketClass, eventTicketObject }
}
