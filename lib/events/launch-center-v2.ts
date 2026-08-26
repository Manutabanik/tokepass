import {
  draftNumberValue,
  isEventDraftPublishable,
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
    { price?: unknown; name?: unknown; stock?: unknown } | null | undefined
  > | null
  flyerUrl?: string | null
  bannerUrl?: string | null
  venueCapacity?: unknown
  settings?: { absorbFees?: boolean | null } | null
}

export type DraftLaunchSaleSimulation = {
  ticketPrice: number
  feeAmount: number
  customerPays: number
  organizerReceives: number
  absorbFees: boolean
}

export type DraftLaunchCheckId = "identity" | "tickets" | "capacity"

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

export function cheapestDraftTicketPrice(
  tickets: DraftLaunchValues["tickets"],
): number | null {
  if (!Array.isArray(tickets) || tickets.length === 0) return null
  let min: number | null = null
  for (const ticket of tickets) {
    const price = draftNumberValue(ticket?.price)
    if (!Number.isFinite(price)) continue
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
  const feeAmount = Math.round(price * rate)
  return {
    ticketPrice: price,
    feeAmount,
    absorbFees,
    customerPays: absorbFees ? price : price + feeAmount,
    organizerReceives: absorbFees ? price - feeAmount : price,
  }
}

export function draftLaunchChecklist(values: DraftLaunchValues): DraftLaunchCheck[] {
  const name =
    typeof values.basicInfo?.name === "string" ? values.basicInfo.name.trim() : ""
  const days = resolveDraftSchedule(values)
  const start = days[0]?.startDate.trim() ?? ""
  const end = days[0]?.endDate.trim() ?? ""
  const tickets = Array.isArray(values.tickets) ? values.tickets : []
  const capacity = draftNumberValue(values.venueCapacity)

  return [
    {
      id: "identity",
      label: "Nombre y fechas completas",
      ok: Boolean(name && start && end),
    },
    {
      id: "tickets",
      label: "Al menos una entrada",
      ok: tickets.some((ticket) => {
        if (!ticket || typeof ticket !== "object") return false
        const name =
          typeof ticket.name === "string" ? ticket.name.trim() : ""
        return Boolean(name) && draftNumberValue(ticket.stock) >= 1
      }),
    },
    {
      id: "capacity",
      label: "Aforo mayor a 0",
      ok: capacity > 0,
    },
  ]
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
    minPrice: cheapestDraftTicketPrice(values.tickets),
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
