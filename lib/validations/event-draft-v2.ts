import { z } from "zod"

import {
  emptyDraftSeatingMap,
  isMapDraftTicket,
  toDraftSeatingMap,
} from "@/lib/events/draft-seating-map-v2"

export { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"

const draftLineItemSchema = z.object({
  id: z.string().optional().default(""),
  name: z.string().optional().default(""),
  description: z.string().optional().default(""),
  price: z.coerce.number().optional().default(0),
  stock: z.coerce.number().optional().default(0),
  minOrder: z.coerce.number().optional().default(1),
  maxOrder: z.coerce.number().optional().default(10),
  source: z.string().optional().default(""),
  sectorId: z.string().optional().default(""),
  layoutType: z.string().optional().default("general"),
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
    isPublic: z.boolean().optional().default(false),
    absorbFees: z.boolean().optional().default(false),
    refundPolicy: z.string().optional().default(""),
    checkoutMessage: z.string().optional().default(""),
    deliveryMode: z.enum(EVENT_DRAFT_DELIVERY_MODES).optional().default("PRESENCIAL"),
  })
  .default({
    isPublic: false,
    absorbFees: false,
    refundPolicy: "",
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

const eventDraftFieldsSchema = z.object({
  basicInfo: draftBasicInfoSchema,
  location: draftLocationSchema,
  flyerUrl: z.string().optional().default(""),
  bannerUrl: z.string().optional().default(""),
  venueCapacity: z.coerce.number().optional().default(0),
  tickets: z.array(draftLineItemSchema).default([]),
  extras: z.array(draftLineItemSchema).default([]),
  seatingMap: draftSeatingMapSchema,
  settings: draftSettingsSchema,
})

export const eventDraftSchema = eventDraftFieldsSchema.passthrough()

const publishLineItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Requerido"),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().min(1, "El stock debe ser mayor a 0"),
  minOrder: z.coerce.number().optional(),
  maxOrder: z.coerce.number().optional(),
  source: z.string().optional(),
  sectorId: z.string().optional(),
  layoutType: z.string().optional(),
})

export const eventPublishSchema = z
  .object({
    basicInfo: z.object({
      name: z.string().min(1, "El nombre es obligatorio"),
      startDate: z.string().min(1, "La fecha de inicio es obligatoria"),
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
    tickets: z
      .array(publishLineItemSchema)
      .min(1, "Agregá al menos una entrada"),
    extras: z.array(draftLineItemSchema).optional(),
    seatingMap: z
      .object({
        url: z.string().optional(),
        sectors: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    settings: z
      .object({
        isPublic: z.boolean().optional(),
        absorbFees: z.boolean().optional(),
        refundPolicy: z.string().optional(),
        checkoutMessage: z.string().optional(),
        deliveryMode: z.enum(EVENT_DRAFT_DELIVERY_MODES).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const start = data.basicInfo.startDate?.trim()
    const end = data.basicInfo.endDate?.trim()
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
          path: ["basicInfo", "endDate"],
          message: "La fecha de fin debe ser posterior al inicio",
        })
      }
    }

    if (data.settings?.deliveryMode === "ONLINE") return
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
    source: "",
    sectorId: "",
    layoutType: "general",
  }
}

export function emptyEventDraftV2Location(): EventDraftV2Location {
  return { venueName: "", address: "", province: "", city: "" }
}

export function emptyEventDraftV2(): EventDraftV2 {
  return {
    basicInfo: { name: "", startDate: "", endDate: "", locationName: "" },
    location: emptyEventDraftV2Location(),
    flyerUrl: "",
    bannerUrl: "",
    venueCapacity: 0,
    tickets: [],
    extras: [],
    seatingMap: emptyDraftSeatingMap(),
    settings: {
      isPublic: false,
      absorbFees: false,
      refundPolicy: "",
      checkoutMessage: "",
      deliveryMode: "PRESENCIAL",
    },
  }
}

export function isEventDraftOnline(values: unknown): boolean {
  if (!values || typeof values !== "object" || Array.isArray(values)) return false
  const settings = (values as { settings?: { deliveryMode?: unknown } }).settings
  return settings?.deliveryMode === "ONLINE"
}

export function createDraftLineItem(): EventDraftV2LineItem {
  return emptyEventDraftV2LineItem(crypto.randomUUID())
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

function parseDraftLineItems(raw: unknown): EventDraftV2LineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return emptyEventDraftV2LineItem(`item-${index}`)
    }
    const record = item as Record<string, unknown>
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id
        : `item-${index}`
    return {
      id,
      name: asOptionalString(record.name),
      description: asOptionalString(record.description),
      price: asFiniteNumber(record.price),
      stock: asFiniteNumber(record.stock),
      minOrder:
        record.minOrder == null || record.minOrder === ""
          ? 1
          : asFiniteNumber(record.minOrder, 1),
      maxOrder:
        record.maxOrder == null || record.maxOrder === ""
          ? 10
          : asFiniteNumber(record.maxOrder, 10),
      source: asOptionalString(record.source),
      sectorId: asOptionalString(record.sectorId ?? record.seatingSectorId),
      layoutType: asOptionalString(record.layoutType) || "general",
    }
  })
}

export function toEventDraftV2Payload(values: EventDraftV2) {
  const name = values.basicInfo?.name ?? ""
  const venueName =
    values.location?.venueName?.trim() || values.basicInfo?.locationName || ""
  return {
    ...values,
    title: name,
    basicInfo: {
      ...values.basicInfo,
      locationName: venueName,
    },
    location: {
      ...emptyEventDraftV2Location(),
      ...values.location,
      venueName,
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

  return {
    ...record,
    basicInfo: {
      name,
      startDate: asOptionalString(basicRaw.startDate),
      endDate: asOptionalString(basicRaw.endDate),
      locationName: venueName,
    },
    location: {
      venueName,
      address: asOptionalString(locationRaw.address),
      province: asOptionalString(locationRaw.province),
      city:
        asOptionalString(locationRaw.city) ||
        asOptionalString(locationRaw.department),
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
    },
    flyerUrl: asOptionalString(record.flyerUrl),
    bannerUrl: asOptionalString(record.bannerUrl),
    venueCapacity: asFiniteNumber(record.venueCapacity),
    tickets: parseDraftLineItems(record.tickets),
    extras: parseDraftLineItems(record.extras),
    seatingMap: toDraftSeatingMap(seatingRaw),
    settings: {
      isPublic: settingsRaw.isPublic === true,
      absorbFees: settingsRaw.absorbFees === true,
      refundPolicy: asOptionalString(settingsRaw.refundPolicy),
      checkoutMessage: asOptionalString(settingsRaw.checkoutMessage),
      deliveryMode:
        settingsRaw.deliveryMode === "ONLINE" ? "ONLINE" : "PRESENCIAL",
    },
  }
}

/** SSOT: only general ticket stock counts. Extras and map seats never occupy venue capacity. */
export function draftCapacityThermometer(input: {
  tickets?: Array<{ stock?: unknown; source?: unknown; sectorId?: unknown }> | null
  venueCapacity?: unknown
}) {
  const used = (input.tickets ?? []).reduce((sum, ticket) => {
    if (isMapDraftTicket(ticket)) return sum
    return sum + asFiniteNumber(ticket.stock)
  }, 0)
  const capacity = asFiniteNumber(input.venueCapacity)
  const ratio = capacity > 0 ? used / capacity : 0
  return {
    used,
    capacity,
    ratio,
    percent: Math.min(100, Math.round(ratio * 100)),
    overCapacity: capacity > 0 && used > capacity,
    remaining: capacity > 0 ? Math.max(0, capacity - used) : 0,
    overflow: capacity > 0 ? Math.max(0, used - capacity) : 0,
  }
}
