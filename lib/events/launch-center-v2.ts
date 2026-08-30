import { splitAbsorbFee } from "@/lib/pricing/absorb-fee-split"
import { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"
import {
  draftNumberValue,
  isEventDraftOnline,
  isEventDraftPublishable,
  resolveDraftHasMap,
  resolveDraftSchedule,
} from "@/lib/validations/event-draft-v2"

export const DRAFT_LAUNCH_PLATFORM_FEE = 0.1

export type DraftLaunchValues = {
  basicInfo?: {
    name?: string | null
    startDate?: string | null
    endDate?: string | null
    locationName?: string | null
  } | null
  location?: {
    venueName?: string | null
  } | null
  schedule?: unknown
  tickets?: Array<
    {
      price?: unknown
      name?: unknown
      stock?: unknown
      source?: unknown
      sectorId?: unknown
      seatingSectorId?: unknown
      seating_sector_id?: unknown
      dayRates?: Array<{ price?: unknown; stock?: unknown }> | null
    } | null | undefined
  > | null
  flyerUrl?: string | null
  bannerUrl?: string | null
  venueCapacity?: unknown
  hasMap?: boolean | null
  seatingMaps?: unknown
  seatingMap?: unknown
  virtualLink?: string | null
  isVirtual?: boolean | null
  settings?: {
    absorbFees?: boolean | null
    deliveryMode?: string | null
  } | null
}

export type DraftLaunchSaleSimulation = {
  ticketPrice: number
  feeAmount: number
  customerPays: number
  organizerReceives: number
  absorbFees: boolean
}

export type DraftLaunchCheckId = "identity" | "tickets" | "capacity" | "access"

export type DraftLaunchCheck = {
  id: DraftLaunchCheckId
  label: string
  ok: boolean
}

export type DraftLaunchPreview = {
  name: string
  startDate: string
  imageUrl: string
  locationName: string
  minPrice: number | null
}

export function launchSellableTickets(
  values: DraftLaunchValues,
): NonNullable<DraftLaunchValues["tickets"]> {
  const tickets = Array.isArray(values.tickets) ? values.tickets : []
  const mapEnabled = resolveDraftHasMap({
    hasMap: values.hasMap,
    seatingMaps: Array.isArray(values.seatingMaps)
      ? values.seatingMaps
      : null,
    seatingMap: values.seatingMap,
  })
  return tickets.filter((ticket) => {
    if (!ticket || typeof ticket !== "object") return false
    return mapEnabled || !isMapDraftTicket(ticket)
  })
}

function ticketSamplePrice(ticket: {
  price?: unknown
  dayRates?: Array<{ price?: unknown }> | null
}): number | null {
  const rates = Array.isArray(ticket.dayRates) ? ticket.dayRates : []
  let min: number | null = null
  for (const rate of rates) {
    const price = draftNumberValue(rate?.price)
    if (!Number.isFinite(price)) continue
    if (min == null || price < min) min = price
  }
  if (min != null) return min
  const headline = draftNumberValue(ticket.price)
  return Number.isFinite(headline) ? headline : null
}

export function cheapestDraftTicketPrice(
  tickets: DraftLaunchValues["tickets"],
  values?: Pick<DraftLaunchValues, "hasMap" | "seatingMaps" | "seatingMap">,
): number | null {
  const rows = values
    ? launchSellableTickets({ ...values, tickets })
    : Array.isArray(tickets)
      ? tickets
      : []
  if (rows.length === 0) return null
  let min: number | null = null
  for (const ticket of rows) {
    if (!ticket) continue
    const price = ticketSamplePrice(ticket)
    if (price == null) continue
    if (min == null || price < min) min = price
  }
  return min
}

export function simulateDraftSale(
  ticketPrice: number,
  absorbFees: boolean,
  platformFee = DRAFT_LAUNCH_PLATFORM_FEE,
): DraftLaunchSaleSimulation {
  const price = Math.max(0, draftNumberValue(ticketPrice))
  const rate = Number.isFinite(platformFee) ? Math.max(0, platformFee) : DRAFT_LAUNCH_PLATFORM_FEE
  const split = splitAbsorbFee({
    ticketPrice: price,
    feeRate: rate,
    absorbFees,
  })
  return {
    ticketPrice: split.ticketPrice,
    feeAmount: split.feeAmount,
    absorbFees: split.absorbFees,
    customerPays: split.customerTotal,
    organizerReceives: split.organizerEarnings,
  }
}

export function draftLaunchChecklist(values: DraftLaunchValues): DraftLaunchCheck[] {
  const name =
    typeof values.basicInfo?.name === "string" ? values.basicInfo.name.trim() : ""
  const days = resolveDraftSchedule(values)
  const dated = days.filter((day) => day.startDate.trim())
  const start = days[0]?.startDate.trim() ?? ""
  const end = days[0]?.endDate.trim() ?? ""
  const tickets = launchSellableTickets(values)
  const capacity = draftNumberValue(values.venueCapacity)
  const identityReady = Boolean(
    name && start && (dated.length < 2 || Boolean(end)),
  )

  return [
    {
      id: "identity",
      label: "Nombre y fechas completas",
      ok: identityReady,
    },
    {
      id: "tickets",
      label: "Al menos una entrada",
      ok: tickets.some((ticket) => {
        if (!ticket || typeof ticket !== "object") return false
        const ticketName =
          typeof ticket.name === "string" ? ticket.name.trim() : ""
        const rates = Array.isArray(ticket.dayRates) ? ticket.dayRates : []
        const stock =
          rates.length > 0
            ? rates.reduce(
                (sum, rate) => sum + draftNumberValue(rate.stock),
                0,
              )
            : draftNumberValue(ticket.stock)
        return Boolean(ticketName) && stock >= 1
      }),
    },
    {
      id: "capacity",
      label: "Aforo mayor a 0",
      ok: capacity > 0,
    },
    ...(isEventDraftOnline(values)
      ? [
          {
            id: "access" as const,
            label: "Link de acceso online",
            ok: isLaunchHttpUrl(
              typeof values.virtualLink === "string"
                ? values.virtualLink
                : "",
            ),
          },
        ]
      : []),
  ]
}

function isLaunchHttpUrl(url: string): boolean {
  const text = url.trim()
  if (!text) return false
  try {
    const parsed = new URL(text)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function isDraftLaunchReady(values: DraftLaunchValues): boolean {
  return isEventDraftPublishable(values)
}

export function draftLaunchPreview(values: DraftLaunchValues): DraftLaunchPreview {
  const days = resolveDraftSchedule(values)
  const name =
    typeof values.basicInfo?.name === "string" ? values.basicInfo.name.trim() : ""
  const venue =
    typeof values.location?.venueName === "string"
      ? values.location.venueName.trim()
      : ""
  const locationName =
    venue ||
    (typeof values.basicInfo?.locationName === "string"
      ? values.basicInfo.locationName.trim()
      : "")
  const flyer = typeof values.flyerUrl === "string" ? values.flyerUrl.trim() : ""
  const banner = typeof values.bannerUrl === "string" ? values.bannerUrl.trim() : ""

  return {
    name: name || "Sin título",
    startDate: days[0]?.startDate.trim() ?? "",
    imageUrl: flyer || banner,
    locationName: locationName || "Ubicación pendiente",
    minPrice: cheapestDraftTicketPrice(values.tickets, values),
  }
}

export function draftLaunchSubmitLabel(
  isPublished: boolean,
  publishing: boolean,
): string {
  if (publishing) {
    return isPublished ? "Actualizando..." : "Subiendo al catálogo..."
  }
  return isPublished ? "Actualizar catálogo" : "Subir al catálogo"
}

export function draftLaunchPreviewLabel(
  isPublished: boolean,
  previewing: boolean,
): string {
  if (previewing) {
    return isPublished ? "Abriendo vista previa..." : "Guardando borrador..."
  }
  return isPublished ? "Ver como comprador" : "Guardar y probar borrador"
}
