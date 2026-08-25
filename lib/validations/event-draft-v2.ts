import { z } from "zod"

export const eventDraftV2LineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.coerce.number(),
  stock: z.coerce.number(),
})

const eventDraftV2FieldsSchema = z.object({
  title: z.string(),
  venueCapacity: z.coerce.number().optional().default(0),
  tickets: z.array(eventDraftV2LineItemSchema).default([]),
  extras: z.array(eventDraftV2LineItemSchema).default([]),
  settings: z
    .object({
      isPublic: z.boolean().default(false),
      refundPolicy: z.string().optional(),
    })
    .default({ isPublic: false }),
})

export const eventDraftV2Schema = eventDraftV2FieldsSchema.passthrough()

export type EventDraftV2LineItem = z.infer<typeof eventDraftV2LineItemSchema>
export type EventDraftV2 = z.infer<typeof eventDraftV2FieldsSchema>

export function emptyEventDraftV2LineItem(
  id = "item-0",
): EventDraftV2LineItem {
  return { id, name: "", price: 0, stock: 0 }
}

export function emptyEventDraftV2(): EventDraftV2 {
  return {
    title: "",
    venueCapacity: 0,
    tickets: [],
    extras: [],
    settings: { isPublic: false, refundPolicy: "" },
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
      name: typeof record.name === "string" ? record.name : "",
      price: asFiniteNumber(record.price),
      stock: asFiniteNumber(record.stock),
    }
  })
}

export function parseEventDraftV2(raw: unknown): EventDraftV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyEventDraftV2()
  }
  const record = raw as Record<string, unknown>
  const settingsRaw =
    record.settings &&
    typeof record.settings === "object" &&
    !Array.isArray(record.settings)
      ? (record.settings as Record<string, unknown>)
      : {}

  return {
    ...record,
    title: typeof record.title === "string" ? record.title : "",
    venueCapacity: asFiniteNumber(record.venueCapacity),
    tickets: parseDraftLineItems(record.tickets),
    extras: parseDraftLineItems(record.extras),
    settings: {
      isPublic: settingsRaw.isPublic === true,
      refundPolicy:
        typeof settingsRaw.refundPolicy === "string"
          ? settingsRaw.refundPolicy
          : "",
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
