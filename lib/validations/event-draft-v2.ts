import { z } from "zod"

import {
  EVENT_DRAFT_ARCHETYPES,
  archetypeSupportsVirtual,
  resolveDraftArchetype,
} from "@/lib/events/archetypes.config"
import {
  draftHasActiveSeatingMap,
  emptyDraftSeatingMap,
  isMapDraftTicket,
  parseDraftSeatingMaps,
  primaryDraftSeatingMapRaw,
  toDraftSeatingMap,
} from "@/lib/events/draft-seating-map-v2"
import {
  createDraftScheduleDay,
  resolveNormalizedDraftSchedule,
  resolveScheduleDayId,
  type EventDraftV2ScheduleDay,
} from "@/lib/events/draft-schedule-slots-v2"
import {
  TICKET_COMMERCE_TYPES,
  asTicketCommerceType,
  type TicketCommerceType,
} from "@/lib/events/ticket-commerce-type"
import { parsePromoVideoUrl } from "@/lib/promo-video"
import { parseDraftRefundPolicy } from "@/lib/events/refund-policy"
import { EVENT_REFUND_POLICIES } from "@/lib/validations/event-form"

export {
  EVENT_DRAFT_ARCHETYPES,
  type EventDraftArchetype,
} from "@/lib/events/archetypes.config"

export { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"

export {
  createDraftScheduleDay,
  createDraftScheduleSlot,
  type EventDraftV2ScheduleDay,
  type EventDraftV2ScheduleSlot,
} from "@/lib/events/draft-schedule-slots-v2"

export const EVENT_DRAFT_NAME_MAX = 120
export const EVENT_DRAFT_TEXT_MAX = 2000
export const EVENT_DRAFT_TICKET_DESCRIPTION_MAX = 180
export const DRAFT_CAPACITY_OVERFLOW_MESSAGE =
  "El stock configurado supera la capacidad del recinto"

function normalizeDraftPromoVideoUrl(value: unknown): string {
  if (typeof value !== "string") return ""
  const raw = value.trim()
  if (!raw) return ""
  return parsePromoVideoUrl(raw)?.canonicalUrl ?? raw
}

export function sanitizeDraftText(value: string, maxLen: number): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
}

const draftScheduleSlotSchema = z.object({
  id: z.string().optional().default(""),
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  capacity: z.coerce.number().min(0).optional(),
})

const draftScheduleDaySchema = z.object({
  id: z.string().optional().default(""),
  name: z.string().optional().default(""),
  date: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  slots: z.array(draftScheduleSlotSchema).default([]),
})

export const EVENT_DRAFT_LINEUP_SOURCES = ["spotify", "custom", "local"] as const
export type EventDraftLineupSource = (typeof EVENT_DRAFT_LINEUP_SOURCES)[number]

export type EventDraftV2LineupItem = {
  id: string
  name: string
  avatarUrl: string
  role: string
  source: EventDraftLineupSource
  dayIds: string[]
}

const draftLineupItemSchema = z.object({
  id: z.string().optional().default(""),
  name: z.string().optional().default(""),
  avatarUrl: z.string().optional().default(""),
  role: z.string().optional().default(""),
  source: z.enum(EVENT_DRAFT_LINEUP_SOURCES).optional().default("custom"),
  dayIds: z.array(z.string()).default([]),
})

const draftDayRateSchema = z.object({
  dayId: z.string().optional().default(""),
  price: z.coerce.number().min(0).optional().default(0),
  stock: z.coerce.number().min(0).optional().default(0),
  ticketId: z.string().optional().default(""),
})

const draftLineItemSchema = z.object({
  id: z.string().optional().default(""),
  name: z.string().optional().default(""),
  description: z.string().optional().default(""),
  price: z.coerce.number().min(0).optional().default(0),
  stock: z.coerce.number().min(0).optional().default(0),
  minOrder: z.coerce.number().min(1).optional().default(1),
  maxOrder: z.coerce.number().min(1).optional().default(10),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  source: z.string().optional().default(""),
  sectorId: z.string().optional().default(""),
  seatingSectorId: z.string().nullable().optional(),
  seating_sector_id: z.string().nullable().optional(),
  layoutType: z.string().optional().default("general"),
  slotId: z.string().optional().default(""),
  validDayIds: z.array(z.string()).default([]),
  dayRates: z.array(draftDayRateSchema).default([]),
  ticketType: z.enum(TICKET_COMMERCE_TYPES).optional().default("standard"),
})

export const EVENT_DRAFT_DELIVERY_MODES = ["PRESENCIAL", "ONLINE"] as const
export type EventDraftDeliveryMode = (typeof EVENT_DRAFT_DELIVERY_MODES)[number]

const optionalDraftCoord = z.preprocess((value) => {
  if (value === "" || value == null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}, z.number().optional())

const draftLocationFields = {
  venueName: z.string().optional().default(""),
  address: z.string().optional().default(""),
  province: z.string().optional().default(""),
  city: z.string().optional().default(""),
  lat: optionalDraftCoord,
  lng: optionalDraftCoord,
}

const emptyDraftLocation = {
  venueName: "",
  address: "",
  province: "",
  city: "",
}

const draftLocationSchema = z.object(draftLocationFields).default(emptyDraftLocation)

const draftBasicInfoSchema = z
  .object({
    name: z.string().optional().default(""),
    startDate: z.string().optional().default(""),
    endDate: z.string().optional().default(""),
    locationName: z.string().optional().default(""),
  })
  .default({ name: "", startDate: "", endDate: "", locationName: "" })

const draftSettingsSchema = z
  .object({
    isPublic: z.boolean().optional().default(true),
    absorbFees: z.boolean().optional().default(false),
    refundPolicy: z.preprocess(
      (value) => parseDraftRefundPolicy(value),
      z.enum(EVENT_REFUND_POLICIES),
    ).optional().default("organizer"),
    checkoutMessage: z.string().optional().default(""),
    deliveryMode: z.enum(EVENT_DRAFT_DELIVERY_MODES).optional().default("PRESENCIAL"),
  })
  .default({
    isPublic: true,
    absorbFees: false,
    refundPolicy: "organizer",
    checkoutMessage: "",
    deliveryMode: "PRESENCIAL",
  })

const draftSeatingMapSchema = z
  .object({
    url: z.string().optional().default(""),
    sectors: z.array(z.unknown()).default([]),
  })
  .passthrough()
  .default({ url: "", sectors: [] })

const draftSeatingMapInstanceSchema = z.object({
  dateId: z.string(),
  mapConfig: z.unknown().optional().default({}),
  pricing: z.unknown().optional().default({}),
})

const eventDraftFieldsSchema = z.object({
  archetype: z.enum(EVENT_DRAFT_ARCHETYPES).optional().default("show"),
  isVirtual: z.boolean().optional().default(false),
  virtualLink: z.string().optional().default(""),
  basicInfo: draftBasicInfoSchema,
  location: draftLocationSchema,
  flyerUrl: z.string().optional().default(""),
  bannerUrl: z.string().optional().default(""),
  promoVideoUrl: z.preprocess(
    normalizeDraftPromoVideoUrl,
    z.string().optional().default(""),
  ),
  galleryUrls: z.array(z.string().url()).default([]),
  restrictions: z.string().optional().default(""),
  whatToBring: z.string().optional().default(""),
  venueCapacity: z.coerce.number().min(0).optional().default(0),
  hasMap: z.boolean().optional().default(false),
  schedule: z.array(draftScheduleDaySchema).default([]),
  lineup: z.array(draftLineupItemSchema).default([]),
  tickets: z.array(draftLineItemSchema).default([]),
  extras: z.array(draftLineItemSchema).default([]),
  seatingMap: draftSeatingMapSchema,
  seatingMaps: z.array(draftSeatingMapInstanceSchema).default([]),
  settings: draftSettingsSchema,
})

export const eventDraftSchema = eventDraftFieldsSchema.passthrough()

function refineLineItemWindowAndLimits(
  item: {
    startDate?: string
    endDate?: string
    minOrder?: number
    maxOrder?: number
  },
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number>,
) {
  const start = item.startDate?.trim() ?? ""
  const end = item.endDate?.trim() ?? ""
  if (start && end) {
    const startMs = Date.parse(start)
    const endMs = Date.parse(end)
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
      ctx.addIssue({
        code: "custom",
        path: [...pathPrefix, "endDate"],
        message: "La venta debe terminar después de iniciar",
      })
    }
  }
  if (
    item.minOrder != null &&
    item.maxOrder != null &&
    Number.isFinite(item.minOrder) &&
    Number.isFinite(item.maxOrder) &&
    item.maxOrder < item.minOrder
  ) {
    ctx.addIssue({
      code: "custom",
      path: [...pathPrefix, "maxOrder"],
      message: "El máximo por compra no puede ser menor al mínimo",
    })
  }
}

const publishLineItemSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1, "Requerido").max(EVENT_DRAFT_NAME_MAX),
    description: z.string().max(EVENT_DRAFT_TICKET_DESCRIPTION_MAX).optional(),
    price: z.coerce.number().min(0),
    stock: z.coerce.number().min(0),
    minOrder: z.coerce.number().min(1).optional(),
    maxOrder: z.coerce.number().min(1).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    source: z.string().optional(),
    sectorId: z.string().optional(),
    seatingSectorId: z.string().nullable().optional(),
    seating_sector_id: z.string().nullable().optional(),
    layoutType: z.string().optional(),
    slotId: z.string().optional(),
    validDayIds: z.array(z.string()).optional().default([]),
    dayRates: z.array(draftDayRateSchema).optional().default([]),
    ticketType: z.enum(TICKET_COMMERCE_TYPES).optional().default("standard"),
  })
  .superRefine((item, ctx) => {
    refineLineItemWindowAndLimits(item, ctx, [])
    const rates = (item.dayRates ?? []).filter((rate) => rate.dayId.trim())
    if (rates.length > 0) {
      if (rates.every((rate) => draftNumberValue(rate.stock) < 1)) {
        ctx.addIssue({
          code: "custom",
          path: ["dayRates", 0, "stock"],
          message: "El stock debe ser mayor a 0",
        })
      }
      return
    }
    if (draftNumberValue(item.stock) < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["stock"],
        message: "El stock debe ser mayor a 0",
      })
    }
  })

export const eventPublishSchema = z
  .object({
    archetype: z.enum(EVENT_DRAFT_ARCHETYPES).optional(),
    isVirtual: z.boolean().optional(),
    virtualLink: z.string().optional(),
    basicInfo: z.object({
      name: z
        .string()
        .min(1, "El nombre es obligatorio")
        .max(EVENT_DRAFT_NAME_MAX),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      locationName: z.string().optional(),
    }),
    location: z
      .object({
        venueName: z.string().optional(),
        address: z.string().optional(),
        province: z.string().optional(),
        city: z.string().optional(),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      })
      .optional(),
    flyerUrl: z.string().optional(),
    bannerUrl: z.string().optional(),
    venueCapacity: z.coerce.number().min(1, "Definí el aforo del recinto"),
    hasMap: z.boolean().optional(),
    schedule: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().optional(),
          date: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          slots: z.array(draftScheduleSlotSchema).optional(),
        }),
      )
      .optional(),
    tickets: z
      .array(publishLineItemSchema)
      .min(1, "Agregá al menos una entrada"),
    extras: z.array(draftLineItemSchema).optional(),
    lineup: z.array(draftLineupItemSchema).optional(),
    promoVideoUrl: z.preprocess(
      normalizeDraftPromoVideoUrl,
      z.string().optional().or(z.literal("")),
    ),
    galleryUrls: z.array(z.string().url()).optional().default([]),
    restrictions: z.string().max(EVENT_DRAFT_TEXT_MAX).optional(),
    whatToBring: z.string().max(EVENT_DRAFT_TEXT_MAX).optional(),
    seatingMap: z
      .object({
        url: z.string().optional(),
        sectors: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    seatingMaps: z.array(draftSeatingMapInstanceSchema).optional().default([]),
    settings: z
      .object({
        isPublic: z.boolean().optional(),
        absorbFees: z.boolean().optional(),
        refundPolicy: z
          .preprocess(
            (value) => parseDraftRefundPolicy(value),
            z.enum(EVENT_REFUND_POLICIES),
          )
          .optional()
          .default("organizer"),
        checkoutMessage: z.string().optional().default(""),
        deliveryMode: z.enum(EVENT_DRAFT_DELIVERY_MODES).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const days = resolveDraftSchedule(data)
    const dated = days.filter((day) => day.startDate.trim())
    if (dated.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["schedule", 0, "startDate"],
        message: "La fecha de inicio es obligatoria",
      })
    }

    const multi = dated.length > 1
    for (const [index, day] of days.entries()) {
      const start = day.startDate.trim()
      const end = day.endDate.trim()
      if (!start) {
        if (days.length > 1) {
          ctx.addIssue({
            code: "custom",
            path: ["schedule", index, "startDate"],
            message: "Cada función necesita fecha de inicio",
          })
        }
        continue
      }
      if (multi && !end) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", index, "endDate"],
          message: "Cada función necesita fecha de fin",
        })
        continue
      }
      if (start && end) {
        const startMs = Date.parse(start)
        const endMs = Date.parse(end)
        if (
          Number.isFinite(startMs) &&
          Number.isFinite(endMs) &&
          endMs <= startMs
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["schedule", index, "endDate"],
            message: "La fecha de fin debe ser posterior al inicio",
          })
        }
      }
    }

    for (const [index, extra] of (data.extras ?? []).entries()) {
      const named = extra.name?.trim() ?? ""
      const stock = extra.stock ?? 0
      const price = extra.price ?? 0
      if (!named && stock <= 0 && price <= 0) continue
      if (!named) {
        ctx.addIssue({
          code: "custom",
          path: ["extras", index, "name"],
          message: "Requerido",
        })
      }
      if (stock < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["extras", index, "stock"],
          message: "El stock debe ser mayor a 0",
        })
      }
      if (price < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["extras", index, "price"],
          message: "El precio no puede ser negativo",
        })
      }
      refineLineItemWindowAndLimits(extra, ctx, ["extras", index])
    }

    const isOnline =
      data.isVirtual === true || data.settings?.deliveryMode === "ONLINE"
    if (!isOnline) {
      const meter = draftCapacityThermometer({
        tickets: data.tickets,
        venueCapacity: data.venueCapacity,
        schedule: data.schedule,
      })
      if (meter.overCapacity) {
        ctx.addIssue({
          code: "custom",
          path: ["venueCapacity"],
          message: DRAFT_CAPACITY_OVERFLOW_MESSAGE,
        })
      }
    }

    if (data.isVirtual === true || data.settings?.deliveryMode === "ONLINE") {
      const link = (data.virtualLink ?? "").trim()
      if (!link || !isDraftHttpUrl(link)) {
        ctx.addIssue({
          code: "custom",
          path: ["virtualLink"],
          message: "El link de acceso es obligatorio para un evento online",
        })
      }
      return
    }
    const venueName = (
      data.location?.venueName ||
      data.basicInfo.locationName ||
      ""
    ).trim()
    const address = (data.location?.address || "").trim()
    if (!venueName) {
      ctx.addIssue({
        code: "custom",
        path: ["location", "venueName"],
        message: "El nombre del lugar es obligatorio",
      })
    }
    if (!address) {
      ctx.addIssue({
        code: "custom",
        path: ["location", "address"],
        message: "La dirección es obligatoria",
      })
    }
  })

export const eventDraftV2Schema = eventDraftSchema
export const eventDraftV2UiSchema = eventPublishSchema
export const eventDraftV2LineItemSchema = draftLineItemSchema

export type EventDraftV2LineItem = z.infer<typeof draftLineItemSchema>
export type EventDraftV2Location = {
  venueName: string
  address: string
  province: string
  city: string
  lat?: number
  lng?: number
}
export type EventDraftV2 = z.infer<typeof eventDraftFieldsSchema>
export type EventDraftV2SeatingMapInstance = z.infer<
  typeof draftSeatingMapInstanceSchema
>

export function emptyEventDraftV2LineItem(
  id = "item-0",
): EventDraftV2LineItem {
  return {
    id,
    name: "",
    description: "",
    price: 0,
    stock: 0,
    minOrder: 1,
    maxOrder: 10,
    startDate: "",
    endDate: "",
    source: "general",
    sectorId: "",
    seatingSectorId: null,
    seating_sector_id: null,
    layoutType: "general",
    slotId: "",
    validDayIds: [],
    dayRates: [],
    ticketType: "standard",
  }
}

function asOptionalBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (value === true) return true
    if (value === false) return false
  }
  return undefined
}

/** Explicit flag wins. Missing flag infers true only if the draft already has a map. */
export function resolveDraftHasMap(input: {
  hasMap?: unknown
  has_map?: unknown
  use_seating_chart?: unknown
  seatingMaps?: Array<{ mapConfig?: unknown }> | null
  seatingMap?: unknown
}): boolean {
  const explicit = asOptionalBoolean(
    input.hasMap,
    input.has_map,
    input.use_seating_chart,
  )
  if (explicit != null) return explicit
  return draftHasActiveSeatingMap({
    seatingMaps: input.seatingMaps,
    seatingMap: input.seatingMap,
  })
}

export function emptyEventDraftV2Location(): EventDraftV2Location {
  return { venueName: "", address: "", province: "", city: "" }
}

export function emptyEventDraftV2(): EventDraftV2 {
  const firstDay = createDraftScheduleDay({ name: "Día 1" })
  return {
    archetype: "show",
    isVirtual: false,
    virtualLink: "",
    basicInfo: {
      name: "",
      startDate: firstDay.startDate,
      endDate: firstDay.endDate,
      locationName: "",
    },
    location: emptyEventDraftV2Location(),
    flyerUrl: "",
    bannerUrl: "",
    promoVideoUrl: "",
    galleryUrls: [],
    restrictions: "",
    whatToBring: "",
    venueCapacity: 0,
    hasMap: false,
    schedule: [firstDay],
    lineup: [],
    tickets: [],
    extras: [],
    seatingMap: emptyDraftSeatingMap(),
    seatingMaps: [],
    settings: {
      isPublic: true,
      absorbFees: false,
      refundPolicy: "organizer",
      checkoutMessage: "",
      deliveryMode: "PRESENCIAL",
    },
  }
}

export function isEventDraftOnline(values: unknown): boolean {
  if (!values || typeof values !== "object" || Array.isArray(values)) return false
  const record = values as {
    isVirtual?: unknown
    settings?: { deliveryMode?: unknown }
  }
  return record.isVirtual === true || record.settings?.deliveryMode === "ONLINE"
}

export function createDraftLineItem(
  ticketType: TicketCommerceType = "standard",
): EventDraftV2LineItem {
  return {
    ...emptyEventDraftV2LineItem(crypto.randomUUID()),
    ticketType,
  }
}

export function createDraftLineupItem(
  input: Partial<EventDraftV2LineupItem> = {},
): EventDraftV2LineupItem {
  const source = EVENT_DRAFT_LINEUP_SOURCES.includes(
    input.source as EventDraftLineupSource,
  )
    ? (input.source as EventDraftLineupSource)
    : "custom"
  return {
    id: input.id?.trim() || crypto.randomUUID(),
    name: sanitizeDraftText(input.name?.trim() || "", EVENT_DRAFT_NAME_MAX),
    avatarUrl: input.avatarUrl?.trim() || "",
    role: sanitizeDraftText(input.role ?? "", EVENT_DRAFT_NAME_MAX),
    source,
    dayIds: Array.isArray(input.dayIds)
      ? input.dayIds.filter((id) => typeof id === "string" && id.trim())
      : [],
  }
}

export function toggleDraftLineupDay(
  dayIds: readonly string[] | null | undefined,
  dayId: string,
): string[] {
  const id = dayId.trim()
  const current = (dayIds ?? []).filter((item) => item.trim())
  if (!id) return current
  return current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id]
}

export function draftNumberValue(value: unknown, fallback = 0): number {
  if (value === "" || value == null) return fallback
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return draftNumberValue(value, fallback)
}

function asOptionalCoord(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asOptionalString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function resolveDraftSchedule(values: {
  schedule?: unknown
  basicInfo?: { startDate?: string | null; endDate?: string | null } | null
}): EventDraftV2ScheduleDay[] {
  return resolveNormalizedDraftSchedule(values)
}

function parseDraftLineupSource(value: unknown): EventDraftLineupSource {
  if (value === "spotify" || value === "custom" || value === "local") return value
  return "custom"
}

export function parseDraftLineup(raw: unknown): EventDraftV2LineupItem[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && !Array.isArray(raw)
      ? Array.isArray((raw as { artists?: unknown }).artists)
        ? (raw as { artists: unknown[] }).artists
        : []
      : []
  return source.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const name = asOptionalString(record.name) || asOptionalString(record.artist)
    if (!name) return []
    const spotifyId = asOptionalString(record.spotifyId ?? record.spotify_id)
    const inferredSource = parseDraftLineupSource(record.source)
    const sourceKind =
      inferredSource !== "custom"
        ? inferredSource
        : spotifyId
          ? "spotify"
          : asOptionalString(record.artistId)
            ? "local"
            : "custom"
    const dayIds = Array.isArray(record.dayIds)
      ? record.dayIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : (() => {
          const dayId = asOptionalString(
            record.dayId ?? record.day_id ?? record.dateId,
          )
          return dayId ? [dayId] : []
        })()
    return [
      createDraftLineupItem({
        id:
          asOptionalString(record.id) ||
          spotifyId ||
          asOptionalString(record.artistId) ||
          `lineup-${index}`,
        name,
        avatarUrl: asOptionalString(
          record.avatarUrl ?? record.imageUrl ?? record.image_url,
        ),
        role: asOptionalString(record.role),
        source: sourceKind,
        dayIds,
      }),
    ]
  })
}

function parseDraftLineItems(
  raw: unknown,
  fallbackTicketType: TicketCommerceType = "standard",
): EventDraftV2LineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        ...emptyEventDraftV2LineItem(`item-${index}`),
        ticketType: fallbackTicketType,
      }
    }
    const record = item as Record<string, unknown>
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id
        : `item-${index}`
    return {
      id,
      name: sanitizeDraftText(asOptionalString(record.name), EVENT_DRAFT_NAME_MAX),
      description: sanitizeDraftText(
        asOptionalString(record.description),
        EVENT_DRAFT_TICKET_DESCRIPTION_MAX,
      ),
      price: Math.max(0, asFiniteNumber(record.price)),
      stock: Math.max(0, asFiniteNumber(record.stock)),
      minOrder:
        record.minOrder == null || record.minOrder === ""
          ? 1
          : Math.max(1, asFiniteNumber(record.minOrder, 1)),
      maxOrder:
        record.maxOrder == null || record.maxOrder === ""
          ? 10
          : Math.max(1, asFiniteNumber(record.maxOrder, 10)),
      startDate: asOptionalString(record.startDate ?? record.saleStartsAt),
      endDate: asOptionalString(record.endDate ?? record.saleEndsAt),
      source: asOptionalString(record.source),
      sectorId: asOptionalString(
        record.sectorId ?? record.seatingSectorId ?? record.seating_sector_id,
      ),
      seatingSectorId:
        asOptionalString(record.seatingSectorId ?? record.seating_sector_id) ||
        null,
      seating_sector_id:
        asOptionalString(record.seating_sector_id ?? record.seatingSectorId) ||
        null,
      layoutType: asOptionalString(record.layoutType) || "general",
      slotId: asOptionalString(record.slotId ?? record.dayId ?? record.day_id),
      validDayIds: parseDraftValidDayIds(record.validDayIds),
      dayRates: parseDraftDayRates(record.dayRates ?? record.day_rates),
      ticketType: asTicketCommerceType(
        record.ticketType ?? record.ticket_type,
        fallbackTicketType,
      ),
    }
  })
}

export const EVENT_DRAFT_GALLERY_MAX = 4

function isDraftHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function parseDraftGalleryUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const urls: string[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const url = item.trim()
    if (!url || urls.includes(url) || !isDraftHttpUrl(url)) continue
    urls.push(url)
    if (urls.length >= EVENT_DRAFT_GALLERY_MAX) break
  }
  return urls
}

function parseDraftValidDayIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [
    ...new Set(
      raw.filter((id): id is string => typeof id === "string" && Boolean(id.trim())),
    ),
  ]
}

function parseDraftDayRates(
  raw: unknown,
): EventDraftV2LineItem["dayRates"] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const next: EventDraftV2LineItem["dayRates"] = []
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const dayId = asOptionalString(record.dayId ?? record.day_id)
    if (!dayId || seen.has(dayId)) continue
    seen.add(dayId)
    next.push({
      dayId,
      price: Math.max(0, asFiniteNumber(record.price)),
      stock: Math.max(0, asFiniteNumber(record.stock)),
      ticketId: asOptionalString(record.ticketId ?? record.ticket_id),
    })
  }
  return next
}

function withResolvedTicketValidDays(
  ticket: EventDraftV2LineItem,
  schedule: EventDraftV2ScheduleDay[],
): EventDraftV2LineItem {
  const source =
    ticket.validDayIds.length > 0
      ? ticket.validDayIds
      : ticket.slotId.trim()
        ? [ticket.slotId]
        : []
  return {
    ...ticket,
    validDayIds: [
      ...new Set(
        source
          .map((id) => resolveScheduleDayId(schedule, id) || id.trim())
          .filter((id) => id.length > 0),
      ),
    ],
  }
}

export function toEventDraftV2Payload(values: EventDraftV2) {
  const name = values.basicInfo?.name ?? ""
  const archetype = resolveDraftArchetype(values.archetype)
  const isVirtual =
    archetypeSupportsVirtual(archetype) &&
    (values.isVirtual === true || values.settings?.deliveryMode === "ONLINE")
  const venueName = isVirtual
    ? ""
    : values.location?.venueName?.trim() || values.basicInfo?.locationName || ""
  const schedule = resolveDraftSchedule(values)
  const primary = schedule[0]
  return {
    ...values,
    title: name,
    archetype,
    isVirtual,
    virtualLink: values.virtualLink?.trim() ?? "",
    schedule,
    basicInfo: {
      ...values.basicInfo,
      startDate: primary?.startDate || values.basicInfo?.startDate || "",
      endDate: primary?.endDate || values.basicInfo?.endDate || "",
      locationName: venueName,
    },
    location: isVirtual
      ? emptyEventDraftV2Location()
      : {
          ...emptyEventDraftV2Location(),
          ...values.location,
          venueName,
        },
    settings: {
      ...values.settings,
      deliveryMode: isVirtual ? "ONLINE" : "PRESENCIAL",
    },
  }
}

export function isEventDraftPublishable(values: unknown) {
  return eventPublishSchema.safeParse(values).success
}

export function eventPublishDisabledReason(values: unknown): string {
  const result = eventPublishSchema.safeParse(values)
  if (result.success) return ""
  return result.error.issues
    .slice(0, 3)
    .map((issue) => issue.message)
    .join(" · ")
}

export function parseEventDraftV2(raw: unknown): EventDraftV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyEventDraftV2()
  }
  const record = raw as Record<string, unknown>
  const basicRaw =
    record.basicInfo &&
    typeof record.basicInfo === "object" &&
    !Array.isArray(record.basicInfo)
      ? (record.basicInfo as Record<string, unknown>)
      : {}
  const settingsRaw =
    record.settings &&
    typeof record.settings === "object" &&
    !Array.isArray(record.settings)
      ? (record.settings as Record<string, unknown>)
      : {}
  const seatingRaw =
    record.seatingMap &&
    typeof record.seatingMap === "object" &&
    !Array.isArray(record.seatingMap)
      ? (record.seatingMap as Record<string, unknown>)
      : {}

  const name =
    asOptionalString(basicRaw.name) || asOptionalString(record.title)
  const locationRaw =
    record.location &&
    typeof record.location === "object" &&
    !Array.isArray(record.location)
      ? (record.location as Record<string, unknown>)
      : {}
  const venueName =
    asOptionalString(locationRaw.venueName) ||
    asOptionalString(basicRaw.locationName)
  const lat = asOptionalCoord(locationRaw.lat)
  const lng = asOptionalCoord(locationRaw.lng)
  const startDate = asOptionalString(basicRaw.startDate)
  const endDate = asOptionalString(basicRaw.endDate)
  const schedule = resolveDraftSchedule({
    schedule: record.schedule,
    basicInfo: { startDate, endDate },
  })
  const seatingMaps = parseDraftSeatingMaps(
    record.seatingMaps,
    seatingRaw,
    schedule[0]?.id || "",
  )
  const primary = schedule[0]
  const archetype = resolveDraftArchetype(record.archetype)
  const isVirtual =
    archetypeSupportsVirtual(archetype) &&
    (record.isVirtual === true || settingsRaw.deliveryMode === "ONLINE")

  return {
    ...record,
    archetype,
    isVirtual,
    virtualLink: asOptionalString(record.virtualLink),
    basicInfo: {
      name: sanitizeDraftText(name, EVENT_DRAFT_NAME_MAX),
      startDate: primary?.startDate || startDate,
      endDate: primary?.endDate || endDate,
      locationName: sanitizeDraftText(venueName, EVENT_DRAFT_NAME_MAX),
    },
    schedule,
    location: {
      venueName: sanitizeDraftText(venueName, EVENT_DRAFT_NAME_MAX),
      address: sanitizeDraftText(
        asOptionalString(locationRaw.address),
        EVENT_DRAFT_TEXT_MAX,
      ),
      province: sanitizeDraftText(
        asOptionalString(locationRaw.province),
        EVENT_DRAFT_NAME_MAX,
      ),
      city: sanitizeDraftText(
        asOptionalString(locationRaw.city) ||
          asOptionalString(locationRaw.department),
        EVENT_DRAFT_NAME_MAX,
      ),
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
    },
    flyerUrl: asOptionalString(record.flyerUrl),
    bannerUrl: asOptionalString(record.bannerUrl),
    promoVideoUrl: normalizeDraftPromoVideoUrl(
      record.promoVideoUrl ?? record.promo_video_url,
    ),
    galleryUrls: parseDraftGalleryUrls(
      record.galleryUrls ?? record.gallery_urls,
    ),
    restrictions: sanitizeDraftText(
      asOptionalString(record.restrictions),
      EVENT_DRAFT_TEXT_MAX,
    ),
    whatToBring: sanitizeDraftText(
      asOptionalString(record.whatToBring ?? record.what_to_bring),
      EVENT_DRAFT_TEXT_MAX,
    ),
    venueCapacity: Math.max(0, asFiniteNumber(record.venueCapacity)),
    hasMap: resolveDraftHasMap({
      hasMap: record.hasMap,
      has_map: record.has_map,
      use_seating_chart: record.use_seating_chart,
      seatingMaps,
      seatingMap: seatingRaw,
    }),
    lineup: parseDraftLineup(record.lineup),
    tickets: parseDraftLineItems(record.tickets).map((ticket) =>
      withResolvedTicketValidDays(ticket, schedule),
    ),
    extras: parseDraftLineItems(record.extras, "extra"),
    seatingMap: toDraftSeatingMap(
      primaryDraftSeatingMapRaw(seatingMaps, seatingRaw),
    ),
    seatingMaps: seatingMaps.map((item) => ({
      ...item,
      dateId: item.dateId || schedule[0]?.id || "",
    })),
    settings: {
      isPublic: settingsRaw.isPublic !== false,
      absorbFees: settingsRaw.absorbFees === true,
      refundPolicy: parseDraftRefundPolicy(settingsRaw.refundPolicy),
      checkoutMessage: sanitizeDraftText(
        asOptionalString(settingsRaw.checkoutMessage),
        EVENT_DRAFT_TEXT_MAX,
      ),
      deliveryMode: isVirtual ? "ONLINE" : "PRESENCIAL",
    },
  }
}

function draftTicketOccupiesVenueCapacity(ticket: {
  source?: unknown
  sectorId?: unknown
  ticketType?: unknown
}) {
  if (isMapDraftTicket(ticket)) return false
  return asTicketCommerceType(ticket.ticketType) !== "extra"
}

function draftTicketAssignedStock(ticket: {
  stock?: unknown
  dayRates?: Array<{ stock?: unknown }>
}) {
  const rates = ticket.dayRates
  if (Array.isArray(rates) && rates.length > 0) {
    return rates.reduce((total, rate) => total + asFiniteNumber(rate.stock), 0)
  }
  return asFiniteNumber(ticket.stock)
}

/** SSOT: only `tickets[].stock` (or `dayRates[].stock`) counts. `extras[]` never enter this sum. */
export function draftCapacityThermometer(input: {
  tickets?: Array<{
    stock?: unknown
    source?: unknown
    sectorId?: unknown
    ticketType?: unknown
    dayRates?: Array<{ stock?: unknown }>
  }> | null
  venueCapacity?: unknown
  schedule?: unknown
  slotCount?: number
}) {
  const used = (input.tickets ?? []).reduce((sum, ticket) => {
    if (!draftTicketOccupiesVenueCapacity(ticket)) return sum
    return sum + draftTicketAssignedStock(ticket)
  }, 0)
  const explicitSlots =
    input.slotCount != null
      ? Math.max(0, Math.floor(input.slotCount))
      : Array.isArray(input.schedule)
        ? input.schedule.reduce((count, day) => {
            if (!day || typeof day !== "object" || Array.isArray(day)) return count
            const slots = (day as { slots?: unknown }).slots
            if (!Array.isArray(slots)) return count
            return (
              count +
              slots.filter((slot) => {
                if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
                  return false
                }
                const start = (slot as { startTime?: unknown }).startTime
                return typeof start === "string" && Boolean(start.trim())
              }).length
            )
          }, 0)
        : 0
  const slotCount = explicitSlots > 1 ? explicitSlots : 1
  const perSession = asFiniteNumber(input.venueCapacity)
  const capacity = perSession * slotCount
  const ratio = capacity > 0 ? used / capacity : 0
  return {
    used,
    capacity,
    perSession,
    slotCount,
    ratio,
    percent: Math.min(100, Math.round(ratio * 100)),
    overCapacity: capacity > 0 && used > capacity,
    remaining: capacity > 0 ? Math.max(0, capacity - used) : 0,
    overflow: capacity > 0 ? Math.max(0, used - capacity) : 0,
  }
}
