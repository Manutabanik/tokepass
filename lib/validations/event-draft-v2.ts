import { z } from "zod"

export const eventDraftV2LineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0),
  minOrder: z.coerce.number().default(1),
  maxOrder: z.coerce.number().default(10),
})

export const eventDraftV2LineItemUiSchema = eventDraftV2LineItemSchema.extend({
  name: z.string().min(1, "Requerido"),
})

const eventDraftV2BasicInfoSchema = z
  .object({
    name: z.string().default(""),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationName: z.string().optional(),
  })
  .default({ name: "" })

const eventDraftV2SettingsSchema = z
  .object({
    isPublic: z.boolean().default(false),
    absorbFees: z.boolean().default(false),
    refundPolicy: z.string().optional(),
    checkoutMessage: z.string().optional(),
  })
  .default({ isPublic: false, absorbFees: false })

const eventDraftV2FieldsSchema = z.object({
  basicInfo: eventDraftV2BasicInfoSchema,
  venueCapacity: z.coerce.number().min(0).default(0),
  tickets: z.array(eventDraftV2LineItemSchema).default([]),
  extras: z.array(eventDraftV2LineItemSchema).default([]),
  settings: eventDraftV2SettingsSchema,
})

export const eventDraftV2Schema = eventDraftV2FieldsSchema.passthrough()

export const eventDraftV2UiSchema = eventDraftV2FieldsSchema
  .extend({
    basicInfo: z
      .object({
        name: z.string().min(1, "El nombre es obligatorio").default(""),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        locationName: z.string().optional(),
      })
      .default({ name: "" }),
    tickets: z.array(eventDraftV2LineItemUiSchema).default([]),
    extras: z.array(eventDraftV2LineItemUiSchema).default([]),
  })
  .passthrough()

export type EventDraftV2LineItem = z.infer<typeof eventDraftV2LineItemSchema>
export type EventDraftV2 = z.infer<typeof eventDraftV2FieldsSchema>

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
    venueCapacity: 0,
    tickets: [],
    extras: [],
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
    venueCapacity: asFiniteNumber(record.venueCapacity),
    tickets: parseDraftLineItems(record.tickets),
    extras: parseDraftLineItems(record.extras),
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
