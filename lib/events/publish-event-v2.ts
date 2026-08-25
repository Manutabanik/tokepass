import { calculateTierPricing } from "@/lib/pricing/flexible-pricing"
import {
  defaultEventFeeConfig,
  sumFreeTicketCapacity,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import { parseEventRefundPolicy } from "@/lib/validations/event-form"
import {
  eventPublishSchema,
  type EventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"
import type { Json } from "@/types/database"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PublishEventV2Issue = {
  path: string
  message: string
}

export type PublishEventV2TierPayload = {
  id: string | null
  name: string
  description: string | null
  price: number
  base_price: number
  platform_fee: number
  capacity: number
  min_purchase_limit: number
  max_purchase_limit: number | null
  tier_type: "general" | "addon"
  category: "standard" | "special"
  layout_type: "general"
}

export type PublishEventV2Payload = {
  title: string
  date: string
  ends_at: string | null
  location: string
  visibility: "public" | "private"
  flyer_url: string | null
  image_url: string | null
  social_share_image_url: string | null
  description: string
  refund_policy: "organizer" | "no_refunds" | "until_24h"
  venue: {
    name: string
    location: string
    capacity: number
  }
  venue_map?: Json
  tickets: PublishEventV2TierPayload[]
}

export function formatEventPublishIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): PublishEventV2Issue[] {
  return issues.map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join(".") : "(root)",
    message: issue.message,
  }))
}

export function asPublishUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const id = value.trim()
  return UUID_RE.test(id) ? id : null
}

export function draftDateToIso(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("Fecha inválida")
  }
  const local = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(trimmed)
  const source = local && !local[2] ? `${local[1]}:00` : trimmed
  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Fecha inválida")
  }
  return parsed.toISOString()
}

function clampLimit(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(200, Math.max(1, parsed))
}

function optionalMaxLimit(value: unknown, min: number): number | null {
  if (value == null || value === "") return null
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(200, Math.max(min, parsed))
}

function trimTicketDescription(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return null
  return text.slice(0, 180)
}

function mapLineItemToTier(
  item: EventDraftV2LineItem | {
    id: string
    name: string
    description?: string
    price: number
    stock: number
    minOrder?: number
    maxOrder?: number
  },
  kind: "ticket" | "extra",
  fee: EventFeeConfig,
  absorbFees: boolean,
): PublishEventV2TierPayload | null {
  const name = String(item.name ?? "").trim()
  const stock = Math.floor(Number(item.stock))
  if (!name || !Number.isFinite(stock) || stock < 1) return null

  const inputPrice = Math.max(0, Number(item.price) || 0)
  const priced = calculateTierPricing({
    inputValue: inputPrice,
    feePercentage: fee.platformFeePercentage,
    fixedFee: fee.platformFixedFee,
    feeStrategy: absorbFees ? "absorb_in_price" : "pass_to_customer",
    calculationMode: "public_price",
    sponsored: fee.isSponsoredByTokePass,
  })
  const minPurchase = clampLimit(item.minOrder, 1)
  const isExtra = kind === "extra"

  return {
    id: asPublishUuid(item.id),
    name,
    description: trimTicketDescription(item.description),
    price: priced.publicPrice,
    base_price: priced.organizerNet,
    platform_fee: priced.serviceFee,
    capacity: stock,
    min_purchase_limit: minPurchase,
    max_purchase_limit: optionalMaxLimit(item.maxOrder, minPurchase),
    tier_type: isExtra ? "addon" : "general",
    category: isExtra ? "special" : "standard",
    layout_type: "general",
  }
}

export function composePublishDescription(input: {
  title: string
  checkoutMessage?: string
  refundPolicy?: string
}): string {
  const checkout = input.checkoutMessage?.trim() ?? ""
  const refund = input.refundPolicy?.trim() ?? ""
  const refundIsEnum =
    refund === "organizer" || refund === "no_refunds" || refund === "until_24h"
  const parts = [checkout]
  if (refund && !refundIsEnum) parts.push(refund)
  const description = parts.filter(Boolean).join("\n\n")
  return description || input.title
}

export function buildPublishEventV2Payload(
  draft: unknown,
  fee: EventFeeConfig = defaultEventFeeConfig(),
): PublishEventV2Payload {
  const parsed = eventPublishSchema.parse(draft)
  const title = parsed.basicInfo.name.trim()
  const location = parsed.basicInfo.locationName.trim()
  const absorbFees = parsed.settings?.absorbFees === true
  const tickets = parsed.tickets
    .map((item) => mapLineItemToTier(item, "ticket", fee, absorbFees))
    .filter((item): item is PublishEventV2TierPayload => item != null)
  const extras = (parsed.extras ?? [])
    .map((item) => mapLineItemToTier(item, "extra", fee, absorbFees))
    .filter((item): item is PublishEventV2TierPayload => item != null)

  if (tickets.length < 1) {
    throw new Error("Agregá al menos una entrada")
  }

  const flyer = parsed.flyerUrl?.trim() || null
  const banner = parsed.bannerUrl?.trim() || null
  const seating = parsed.seatingMap
  const venueMap =
    seating &&
    (Boolean(seating.url?.trim()) || (seating.sectors?.length ?? 0) > 0)
      ? (seating as Json)
      : undefined

  return {
    title,
    date: draftDateToIso(parsed.basicInfo.startDate),
    ends_at: parsed.basicInfo.endDate?.trim()
      ? draftDateToIso(parsed.basicInfo.endDate)
      : null,
    location,
    visibility: parsed.settings?.isPublic === true ? "public" : "private",
    flyer_url: flyer,
    image_url: flyer ?? banner,
    social_share_image_url: banner,
    description: composePublishDescription({
      title,
      checkoutMessage: parsed.settings?.checkoutMessage,
      refundPolicy: parsed.settings?.refundPolicy,
    }),
    refund_policy: parseEventRefundPolicy(parsed.settings?.refundPolicy),
    venue: {
      name: location,
      location,
      capacity: Math.floor(Number(parsed.venueCapacity)),
    },
    ...(venueMap ? { venue_map: venueMap } : {}),
    tickets: [...tickets, ...extras],
  }
}

export function freePublishCapacity(payload: PublishEventV2Payload): number {
  return sumFreeTicketCapacity(
    payload.tickets.map((ticket) => ({
      name: ticket.name,
      price: ticket.price,
      capacity: ticket.capacity,
    })),
  )
}
