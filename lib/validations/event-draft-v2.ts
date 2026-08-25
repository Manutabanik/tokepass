import { z } from "zod"

const draftLineItemSchema = z.object({
  id: z.string().optional().default(""),
  name: z.string().optional().default(""),
  description: z.string().optional().default(""),
  price: z.coerce.number().optional().default(0),
  stock: z.coerce.number().optional().default(0),
  minOrder: z.coerce.number().optional().default(1),
  maxOrder: z.coerce.number().optional().default(10),
})

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
  })
  .default({
    isPublic: false,
    absorbFees: false,
    refundPolicy: "",
    checkoutMessage: "",
  })

const draftSeatingMapSchema = z
  .object({
    url: z.string().optional().default(""),
    sectors: z.array(z.any()).default([]),
  })
  .default({ url: "", sectors: [] })

const eventDraftFieldsSchema = z.object({
  basicInfo: draftBasicInfoSchema,
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
})

export const eventPublishSchema = z
  .object({
    basicInfo: z.object({
      name: z.string().min(1, "El nombre es obligatorio"),
      startDate: z.string().min(1, "La fecha de inicio es obligatoria"),
      endDate: z.string().optional(),
      locationName: z.string().min(1, "El lugar es obligatorio"),
    }),
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
        sectors: z.array(z.any()).optional(),
      })
      .optional(),
    settings: z
      .object({
        isPublic: z.boolean().optional(),
        absorbFees: z.boolean().optional(),
        refundPolicy: z.string().optional(),
        checkoutMessage: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const start = data.basicInfo.startDate?.trim()
    const end = data.basicInfo.endDate?.trim()
    if (!start || !end) return
    const startMs = Date.parse(start)
    const endMs = Date.parse(end)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return
    if (endMs <= startMs) {
      ctx.addIssue({
        code: "custom",
        path: ["basicInfo", "endDate"],
        message: "La fecha de fin debe ser posterior al inicio",
      })
    }
  })

export const eventDraftV2Schema = eventDraftSchema
export const eventDraftV2UiSchema = eventPublishSchema
export const eventDraftV2LineItemSchema = draftLineItemSchema

export type EventDraftV2LineItem = z.infer<typeof draftLineItemSchema>
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
  }
}

export function emptyEventDraftV2(): EventDraftV2 {
  return {
    basicInfo: { name: "", startDate: "", endDate: "", locationName: "" },
    flyerUrl: "",
    bannerUrl: "",
    venueCapacity: 0,
    tickets: [],
    extras: [],
    seatingMap: { url: "", sectors: [] },
    settings: {
      isPublic: false,
      absorbFees: false,
      refundPolicy: "",
      checkoutMessage: "",
    },
  }
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
    }
  })
}

export function toEventDraftV2Payload(values: EventDraftV2) {
  const name = values.basicInfo?.name ?? ""
  return {
    ...values,
    title: name,
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

  return {
    ...record,
    basicInfo: {
      name,
      startDate: asOptionalString(basicRaw.startDate),
      endDate: asOptionalString(basicRaw.endDate),
      locationName: asOptionalString(basicRaw.locationName),
    },
    flyerUrl: asOptionalString(record.flyerUrl),
    bannerUrl: asOptionalString(record.bannerUrl),
    venueCapacity: asFiniteNumber(record.venueCapacity),
    tickets: parseDraftLineItems(record.tickets),
    extras: parseDraftLineItems(record.extras),
    seatingMap: {
      url: asOptionalString(seatingRaw.url),
      sectors: Array.isArray(seatingRaw.sectors) ? seatingRaw.sectors : [],
    },
    settings: {
      isPublic: settingsRaw.isPublic === true,
      absorbFees: settingsRaw.absorbFees === true,
      refundPolicy: asOptionalString(settingsRaw.refundPolicy),
      checkoutMessage: asOptionalString(settingsRaw.checkoutMessage),
    },
  }
}

/** SSOT: only general ticket stock counts. Extras never occupy venue capacity. */
export function draftCapacityThermometer(input: {
  tickets?: Array<{ stock?: unknown }> | null
  venueCapacity?: unknown
}) {
  const used = (input.tickets ?? []).reduce(
    (sum, ticket) => sum + asFiniteNumber(ticket.stock),
    0,
  )
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
