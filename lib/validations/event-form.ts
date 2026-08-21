import { z } from "zod"

import {
  computeEventCapacity,
  eventCapacityOverflowMessage,
} from "@/lib/inventory/capacity-budget"
import { findLogicalSector } from "@/lib/inventory/logical-sectors"
import {
  DEFAULT_TICKET_TABS,
  TICKET_DESCRIPTION_MAX,
  TICKET_HIGHLIGHT_BADGES,
} from "@/lib/checkout/ticket-picker"
import {
  BUNDLE_TYPES,
  PROMO_DISCOUNT_TYPES,
} from "@/lib/inventory/flexible-bundles"
import { INVENTORY_TIER_TYPES } from "@/lib/inventory/unified-inventory"
import {
  normalizeScheduleDaysFromForm,
  parseDateTimeLocal,
  remapBoundDayId,
  scheduleDaysToFormValues,
} from "@/lib/event-schedule"
import {
  asUuidOrNull,
  optionalDayId,
  optionalSectorKey,
  optionalUuid,
} from "@/lib/validations/relation-id"
import {
  normalizeTicketSectorInput,
  resolveTicketSectorId,
} from "@/lib/validations/ticket-sku"
import { EVENT_VISIBILITY_VALUES } from "@/types/events"
import { TICKET_TIER_VISIBILITY_VALUES } from "@/types/tickets"

/** ATP = Apta Todo Público. */
export const AGE_RESTRICTION_VALUES = ["atp", "16", "18"] as const
export type AgeRestriction = (typeof AGE_RESTRICTION_VALUES)[number]

export const AGE_RESTRICTION_LABELS: Record<AgeRestriction, string> = {
  atp: "ATP",
  "16": "+16",
  "18": "+18",
}

export const MAX_EVENT_FLYER_BYTES = 5 * 1024 * 1024

export const lineupDraftItemSchema = z.object({
  id: z.string().min(1),
  artistId: z.string().nullable().optional().default(null),
  lineupEntryId: z.string().nullable().optional().default(null),
  spotifyId: z.string().nullable().optional().default(null),
  name: z.string().trim().min(1),
  imageUrl: z.string().nullable().optional().default(null),
  genre: z.string().nullable().optional().default(null),
  performanceTime: z.string().optional().default(""),
  stage: z.string().optional().default(""),
  order: z.number().int().min(0).optional().default(0),
  isHeadliner: z.boolean().optional().default(false),
  topTrackPreviewUrl: z.string().nullable().optional().default(null),
  topTrackName: z.string().nullable().optional().default(null),
})

export const scheduleDaySchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2, "Nombrá la jornada."),
  startTime: z
    .string()
    .min(1, "Definí el inicio de la jornada.")
    .refine(
      (value) => parseDateTimeLocal(value) != null,
      "La hora de inicio no es válida.",
    ),
  endTime: z
    .string()
    .min(1, "Definí el cierre de la jornada.")
    .refine(
      (value) => parseDateTimeLocal(value) != null,
      "La hora de cierre no es válida.",
    ),
})

export const ticketPhaseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Nombrá el lote."),
  price: z
    .number({ error: "Indicá el precio de este lote." })
    .min(0, "El precio no puede ser negativo."),
  capacityLimit: z
    .number({ error: "Indicá el cupo de este lote." })
    .int()
    .min(1, "El lote necesita al menos 1 entrada."),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  status: z
    .enum(["scheduled", "active", "sold_out"])
    .optional()
    .default("scheduled"),
  sold: z.number().int().min(0).optional(),
})

export const ticketTierSchema = z.preprocess(
  normalizeTicketSectorInput,
  z.object({
    id: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
  /** Solo cliente: el persist lo elimina para forzar INSERT. */
  isNew: z.boolean().optional(),
  name: z.string().trim().min(2, "Ingresá un nombre para el tipo de entrada."),
  price: z
    .number({ error: "Indicá el precio de la entrada." })
    .min(0, "El precio no puede ser negativo."),
  capacity: z
    .number({ error: "Indicá la capacidad de esta entrada." })
    .int()
    .min(1, "La cantidad de personas debe ser mayor a cero."),
  sold: z.number().int().min(0).optional(),
  timeLimit: z.string().optional(),
  bonusReward: z.string().trim().optional(),
  description: z
    .string()
    .trim()
    .max(
      TICKET_DESCRIPTION_MAX,
      `La descripción no puede superar ${TICKET_DESCRIPTION_MAX} caracteres.`,
    )
    .optional()
    .default(""),
  highlightBadge: z
    .enum(TICKET_HIGHLIGHT_BADGES)
    .nullable()
    .optional()
    .default(null),
  /** null / "all" / "" = abono completo. Nunca persistir cadena vacía. */
  dayId: optionalDayId,
  visibility: z.enum(TICKET_TIER_VISIBILITY_VALUES),
  layoutType: z.enum(["general", "table_combo", "numbered_seat"]),
  seatingSectorId: optionalSectorKey,
  capacityPerUnit: z.number().int().min(1).max(100),
  minPurchaseLimit: z.number().int().min(1).max(200).optional().default(1),
  maxPurchaseLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .default(null),
  /** QRs independientes por unidad (mesa). */
  admitCount: z.number().int().min(1).max(50),
  tierType: z.enum(INVENTORY_TIER_TYPES).optional().default("general"),
  listPrice: z.number().min(0).nullable().optional(),
  bundleItems: z
    .array(
      z.object({
        tierId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .optional()
    .default([]),
  bundleType: z.enum(BUNDLE_TYPES).nullable().optional(),
  promoDiscountType: z.enum(PROMO_DISCOUNT_TYPES).nullable().optional(),
  promoDiscountValue: z.number().min(0).optional().default(0),
  promoRequiredQty: z.number().int().min(1).max(50).optional().default(1),
  promoPayQty: z.number().int().min(0).max(50).optional().default(1),
  phases: z.array(ticketPhaseSchema).optional().default([]),
  }),
)

const eventFormObject = z
  .object({
    basics: z.object({
      title: z
        .string()
        .trim()
        .min(3, "El título debe tener al menos 3 caracteres."),
      date: z.string(),
      /** Hora de cierre (solo jornada única). */
      endDate: z.string(),
      description: z
        .string()
        .trim()
        .min(10, "Describí la experiencia en al menos 10 caracteres.")
        .max(2000, "La descripción es demasiado extensa."),
      flyerName: z.string().nullable(),
      visibility: z.enum(EVENT_VISIBILITY_VALUES),
      isMultiDay: z.boolean(),
      scheduleDays: z.array(scheduleDaySchema),
      categoryId: z.preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? null : value),
        z.string().uuid("Seleccioná una categoría de la lista."),
      ),
      ageRestriction: z.enum(AGE_RESTRICTION_VALUES, {
        error: "Seleccioná la restricción de edad.",
      }),
      hasSeatingPlan: z.boolean().optional().default(false),
      hasSchedule: z.boolean().optional().default(false),
    }),
    venue: z.object({
      mode: z.enum(["existing", "new"]),
      existingVenueId: optionalUuid,
      zoneType: z.enum(["general_admission", "reserved_seating"]),
      venueName: z.string().trim(),
      venueLocation: z.string().trim().optional(),
      venueCity: z.string().trim().optional(),
      province: z.string().trim().optional(),
      department: z.string().trim().optional(),
      provinceId: z.string().trim().optional().nullable(),
      departmentId: z.string().trim().optional().nullable(),
      capacity: z.number().int().positive().optional(),
      customMaxCapacity: z.number().int().min(0).nullable().optional(),
      rows: z.number().int().positive().optional(),
      seatsPerRow: z.number().int().positive().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      seatingBackgroundUrl: z.string().nullable().optional(),
      venueMap: z.unknown().optional().nullable(),
      seatingLayout: z.unknown().optional(),
      includesSeatingMap: z.boolean().optional().default(false),
      saveVenueForReuse: z.boolean(),
      zones: z
        .array(
          z.object({
            id: z.string().trim().min(1).optional(),
            name: z.string().trim().min(1),
            type: z.enum(["general_admission", "reserved_seating"]),
            capacity: z.number().int().positive(),
            rows: z.number().int().positive().optional().nullable(),
            seatsPerRow: z.number().int().positive().optional().nullable(),
          }),
        )
        .optional(),
    }),
    tickets: z
      .array(ticketTierSchema)
      .min(1, "Creá al menos un tipo de entrada."),
    ticketsDefaultTab: z.enum(DEFAULT_TICKET_TABS).optional().default("auto"),
    lineup: z.array(lineupDraftItemSchema).optional().default([]),
    maxTicketsPerUser: z
      .number()
      .int()
      .min(1, "El tope de compra debe ser al menos 1.")
      .max(200, "El tope de compra no puede superar 200.")
      .nullable()
      .optional(),
  })
  .superRefine((data, context) => {
    const tierNames = new Set<string>()
    for (const [index, tier] of data.tickets.entries()) {
      const normalizedName = tier.name.trim().toLocaleLowerCase("es")
      if (tierNames.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "name"],
          message: "Los nombres de las entradas deben ser únicos.",
        })
      }
      tierNames.add(normalizedName)
      const minLimit = Math.max(1, Number(tier.minPurchaseLimit) || 1)
      const maxLimit = tier.maxPurchaseLimit
      if (
        maxLimit != null &&
        Number.isFinite(Number(maxLimit)) &&
        Number(maxLimit) > 0 &&
        minLimit > Number(maxLimit)
      ) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "maxPurchaseLimit"],
          message: "El máximo por compra no puede ser menor que el mínimo.",
        })
      }

      const usesMap =
        Boolean(data.basics.hasSeatingPlan) &&
        Boolean(data.venue.includesSeatingMap)
      if (
        data.basics.hasSeatingPlan &&
        tier.layoutType !== "general" &&
        !tier.seatingSectorId &&
        !usesMap
      ) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "seatingSectorId"],
          message: "Seleccioná la zona numerada de esta entrada.",
        })
      }
    }

    if (data.basics.isMultiDay) {
      if (data.basics.scheduleDays.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["basics", "scheduleDays"],
          message: "Un festival necesita al menos dos jornadas.",
        })
      }
      for (const [index, day] of data.basics.scheduleDays.entries()) {
        const start = parseDateTimeLocal(day.startTime)?.getTime() ?? NaN
        const end = parseDateTimeLocal(day.endTime)?.getTime() ?? NaN
        if (!(end > start)) {
          context.addIssue({
            code: "custom",
            path: ["basics", "scheduleDays", index, "endTime"],
            message: "El cierre debe ser posterior al inicio.",
          })
        }
      }
    } else {
      const date = data.basics.date?.trim() ?? ""
      const dateMs = parseDateTimeLocal(date)?.getTime() ?? NaN
      if (!date || Number.isNaN(dateMs)) {
        context.addIssue({
          code: "custom",
          path: ["basics", "date"],
          message: "Seleccioná la fecha y hora de inicio.",
        })
      }

      const endDate = data.basics.endDate?.trim() ?? ""
      const endMs = parseDateTimeLocal(endDate)?.getTime() ?? NaN
      if (!endDate || Number.isNaN(endMs)) {
        context.addIssue({
          code: "custom",
          path: ["basics", "endDate"],
          message: "Seleccioná la hora de finalización.",
        })
      } else if (date && endMs <= dateMs) {
        context.addIssue({
          code: "custom",
          path: ["basics", "endDate"],
          message: "La finalización debe ser posterior al inicio.",
        })
      }
    }

    if (data.basics.hasSeatingPlan) {
      if (data.venue.venueName.trim().length < 2) {
        context.addIssue({
          code: "custom",
          path: ["venue", "venueName"],
          message: "Ingresá el nombre del lugar.",
        })
      }
      if (data.venue.mode === "existing" && !data.venue.existingVenueId) {
        context.addIssue({
          code: "custom",
          path: ["venue", "existingVenueId"],
          message: "Seleccioná un lugar guardado.",
        })
      }
    }

    const hasBlueprintZones = (data.venue.zones?.length ?? 0) > 0
    const usesSeatingMap =
      Boolean(data.basics.hasSeatingPlan) &&
      Boolean(data.venue.includesSeatingMap)
    const capacitySnap = computeEventCapacity({
      tickets: data.tickets,
      venueMap: data.venue.venueMap,
      zones: data.venue.zones,
    })
    if (capacitySnap.exceeded) {
      context.addIssue({
        code: "custom",
        path: ["tickets"],
        message: eventCapacityOverflowMessage(capacitySnap),
      })
    }

    for (const [index, tier] of data.tickets.entries()) {
      const phases = tier.phases ?? []
      const phaseSum = phases.reduce(
        (sum, phase) => sum + (Number(phase.capacityLimit) || 0),
        0,
      )
      if (phases.length > 0 && phaseSum > (Number(tier.capacity) || 0)) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "phases"],
          message:
            "La suma de los lotes no puede superar la capacidad de esta entrada.",
        })
      }

      if (tier.layoutType !== "general") continue
      const sector = findLogicalSector(data.venue.zones, tier.seatingSectorId)
      if (!sector) continue
      if ((Number(tier.capacity) || 0) > sector.capacity) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "capacity"],
          message: `El stock no puede superar la capacidad de ${sector.name} (${sector.capacity}).`,
        })
      }
      if (phases.length > 0 && phaseSum > sector.capacity) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "phases"],
          message: `La suma de los lotes no puede superar la capacidad de ${sector.name}.`,
        })
      }
    }

    if (
      data.basics.hasSeatingPlan &&
      !hasBlueprintZones &&
      !usesSeatingMap
    ) {
      if (data.venue.zoneType === "reserved_seating") {
        if (!data.venue.rows) {
          context.addIssue({
            code: "custom",
            path: ["venue", "rows"],
            message: "Definí la cantidad de filas.",
          })
        }

        if (!data.venue.seatsPerRow) {
          context.addIssue({
            code: "custom",
            path: ["venue", "seatsPerRow"],
            message: "Definí cuántos asientos tiene cada fila.",
          })
        }
      }
    }

    // Jornadas stale (el evento cambió de fecha) se re-ligan en
    // coerceDraftEventForm / mapEventFormToRpcPayload. No bloquear el guardado.
  })

/** Validación estricta: solo al publicar. */
export const publishEventSchema = eventFormObject
export const eventFormSchema = publishEventSchema

const draftTicketSchema = z.preprocess(
  normalizeTicketSectorInput,
  z.object({
    id: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
  isNew: z.boolean().optional(),
  name: z.string().optional().default(""),
  price: z.number().optional(),
  capacity: z.number().int().optional(),
  sold: z.number().int().min(0).optional(),
  timeLimit: z.string().optional(),
  bonusReward: z.string().trim().optional(),
  description: z.string().optional().default(""),
  highlightBadge: z
    .enum(TICKET_HIGHLIGHT_BADGES)
    .nullable()
    .optional()
    .default(null),
  dayId: optionalDayId,
  visibility: z.enum(TICKET_TIER_VISIBILITY_VALUES).optional().default("public"),
  layoutType: z
    .enum(["general", "table_combo", "numbered_seat"])
    .optional()
    .default("general"),
  seatingSectorId: optionalSectorKey,
  capacityPerUnit: z.number().int().min(1).max(100).optional().default(1),
  minPurchaseLimit: z.number().int().min(1).max(200).optional().default(1),
  maxPurchaseLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .default(null),
  admitCount: z.number().int().min(1).max(50).optional().default(1),
  tierType: z.enum(INVENTORY_TIER_TYPES).optional().default("general"),
  listPrice: z.number().min(0).nullable().optional(),
  bundleItems: z
    .array(
      z.object({
        tierId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .optional()
    .default([]),
  bundleType: z.enum(BUNDLE_TYPES).nullable().optional(),
  promoDiscountType: z.enum(PROMO_DISCOUNT_TYPES).nullable().optional(),
  promoDiscountValue: z.number().min(0).optional().default(0),
  promoRequiredQty: z.number().int().min(1).max(50).optional().default(1),
  promoPayQty: z.number().int().min(0).max(50).optional().default(1),
  phases: z.array(ticketPhaseSchema).optional().default([]),
  }),
)

/** Autoguardado de borrador: no exige descripción, precio ni venue completo. */
export const draftEventSchema = z.object({
  basics: z.object({
    title: z
      .string()
      .trim()
      .min(3, "El título debe tener al menos 3 caracteres."),
    date: z.string().optional().default(""),
    endDate: z.string().optional().default(""),
    description: z.string().optional().default(""),
    flyerName: z.string().nullable().optional().default(null),
    visibility: z.enum(EVENT_VISIBILITY_VALUES).optional().default("public"),
    isMultiDay: z.boolean().optional().default(false),
    scheduleDays: z.array(z.any()).optional().default([]),
    categoryId: z.string().optional().default(""),
    ageRestriction: z
      .union([z.enum(AGE_RESTRICTION_VALUES), z.literal("")])
      .optional()
      .default(""),
    hasSeatingPlan: z.boolean().optional().default(false),
    hasSchedule: z.boolean().optional().default(false),
  }),
  venue: z
    .object({
      mode: z.enum(["existing", "new"]).optional().default("new"),
      existingVenueId: z
        .union([z.string().uuid(), z.literal(""), z.null()])
        .optional()
        .transform((value) => (value ? value : null)),
      zoneType: z
        .enum(["general_admission", "reserved_seating"])
        .optional()
        .default("general_admission"),
      venueName: z.string().optional().default(""),
      venueLocation: z.string().optional(),
      venueCity: z.string().optional(),
      province: z.string().optional(),
      department: z.string().optional(),
      provinceId: z.string().optional().nullable(),
      departmentId: z.string().optional().nullable(),
      capacity: z.number().int().optional(),
      customMaxCapacity: z.number().int().min(0).nullable().optional(),
      rows: z.number().int().optional(),
      seatsPerRow: z.number().int().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      seatingBackgroundUrl: z.string().nullable().optional(),
      venueMap: z.unknown().optional().nullable(),
      seatingLayout: z.unknown().optional(),
      includesSeatingMap: z.boolean().optional().default(false),
      saveVenueForReuse: z.boolean().optional().default(true),
      zones: z.array(z.any()).optional(),
    })
    .optional()
    .default({
      mode: "new",
      existingVenueId: null,
      zoneType: "general_admission",
      venueName: "",
      includesSeatingMap: false,
      saveVenueForReuse: true,
    }),
  tickets: z.array(draftTicketSchema).optional().default([]),
  ticketsDefaultTab: z.enum(DEFAULT_TICKET_TABS).optional().default("auto"),
  lineup: z.array(lineupDraftItemSchema).optional().default([]),
  maxTicketsPerUser: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
})

export type EventFormValues = z.infer<typeof publishEventSchema>
export type ScheduleDayFormValue = z.infer<typeof scheduleDaySchema>
export type DraftEventFormValues = z.infer<typeof draftEventSchema>

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function blankDraftTicket(): EventFormValues["tickets"][number] {
  return {
    name: "Borrador",
    price: 0,
    capacity: 1,
    timeLimit: "",
    bonusReward: "",
    description: "",
    highlightBadge: null,
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
    admitCount: 1,
    tierType: "general",
    listPrice: null,
    bundleItems: [],
    bundleType: null,
    promoDiscountType: null,
    promoDiscountValue: 0,
    promoRequiredQty: 1,
    promoPayQty: 1,
    phases: [],
  }
}

/** Completa huecos para persistir un draft en el RPC sin perder el trabajo. */
export function coerceDraftEventForm(
  raw: EventFormValues | DraftEventFormValues,
): EventFormValues {
  const startRaw = parseDateTimeLocal(raw.basics.date ?? "")
  const startOk = startRaw != null
  const startDate = startOk
    ? startRaw
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const endParsed = parseDateTimeLocal(raw.basics.endDate ?? "")
  const endOk =
    endParsed != null && endParsed.getTime() > startDate.getTime()
  const endDate = endOk
    ? endParsed
    : new Date(startDate.getTime() + 4 * 60 * 60 * 1000)

  const age = AGE_RESTRICTION_VALUES.includes(
    raw.basics.ageRestriction as AgeRestriction,
  )
    ? (raw.basics.ageRestriction as AgeRestriction)
    : "atp"

  const venue = raw.venue ?? {
    mode: "new" as const,
    zoneType: "general_admission" as const,
    venueName: "",
    saveVenueForReuse: true,
  }

  const reservedIncomplete =
    venue.zoneType === "reserved_seating" &&
    !(venue.zones && venue.zones.length > 0) &&
    (!venue.rows || !venue.seatsPerRow)

  const scheduleDays = scheduleDaysToFormValues(
    normalizeScheduleDaysFromForm(
      (raw.basics.scheduleDays ?? []) as EventFormValues["basics"]["scheduleDays"],
    ),
  )
  const isMultiDay = Boolean(raw.basics.isMultiDay)
  const validDayIds = scheduleDays.map((day) => day.id)

  const incomingTickets = (raw.tickets ?? []) as EventFormValues["tickets"]
  const tickets = incomingTickets
    .filter((tier) => (tier.name ?? "").trim().length >= 2)
    .map((tier) => ({
      ...blankDraftTicket(),
      ...tier,
      name: tier.name.trim(),
      price: Number.isFinite(tier.price) ? Number(tier.price) : 0,
      capacity:
        Number.isFinite(tier.capacity) && Number(tier.capacity) >= 1
          ? Number(tier.capacity)
          : 1,
      layoutType:
        tier.layoutType === "table_combo" || tier.layoutType === "numbered_seat"
          ? tier.layoutType
          : "general",
      visibility: tier.visibility ?? "public",
      capacityPerUnit: tier.capacityPerUnit ?? 1,
      minPurchaseLimit: Math.max(1, Math.floor(Number(tier.minPurchaseLimit) || 1)),
      maxPurchaseLimit:
        tier.maxPurchaseLimit == null || Number(tier.maxPurchaseLimit) <= 0
          ? null
          : Math.floor(Number(tier.maxPurchaseLimit)),
      admitCount: tier.admitCount ?? 1,
      seatingSectorId: resolveTicketSectorId(tier),
      tierType: tier.tierType ?? "general",
      listPrice: tier.listPrice ?? null,
      bundleItems: tier.bundleItems ?? [],
      bundleType: tier.bundleType ?? null,
      promoDiscountType: tier.promoDiscountType ?? null,
      promoDiscountValue: Number(tier.promoDiscountValue) || 0,
      promoRequiredQty: Math.max(
        1,
        Math.floor(Number(tier.promoRequiredQty) || 1),
      ),
      promoPayQty: Math.max(0, Math.floor(Number(tier.promoPayQty) || 1)),
      description: (tier.description ?? "").trim().slice(0, TICKET_DESCRIPTION_MAX),
      highlightBadge: tier.highlightBadge === "bestseller" ? "bestseller" : null,
      dayId: isMultiDay
        ? remapBoundDayId(asUuidOrNull(tier.dayId, ["all"]), validDayIds)
        : null,
      phases: tier.phases ?? [],
    }))

  const zones = Array.isArray(venue.zones)
    ? venue.zones.map((zone) => {
        const item = zone as NonNullable<
          EventFormValues["venue"]["zones"]
        >[number]
        if (
          item.type === "reserved_seating" &&
          (!item.rows || !item.seatsPerRow)
        ) {
          return {
            id: item.id,
            name: item.name || "General",
            type: "general_admission" as const,
            capacity: item.capacity > 0 ? item.capacity : 1,
          }
        }
        return item
      })
    : venue.zones

  return {
    basics: {
      title: raw.basics.title.trim() || "Evento sin título",
      date:
        isMultiDay && scheduleDays[0]?.startTime
          ? scheduleDays[0].startTime
          : toDatetimeLocal(startDate),
      endDate:
        isMultiDay && scheduleDays[scheduleDays.length - 1]?.endTime
          ? scheduleDays[scheduleDays.length - 1].endTime
          : toDatetimeLocal(endDate),
      description: raw.basics.description ?? "",
      flyerName: raw.basics.flyerName ?? null,
      visibility: raw.basics.visibility ?? "public",
      isMultiDay,
      scheduleDays,
      categoryId: UUID_RE.test(raw.basics.categoryId ?? "")
        ? raw.basics.categoryId
        : "",
      ageRestriction: age,
      hasSeatingPlan: Boolean(raw.basics.hasSeatingPlan),
      hasSchedule: Boolean(raw.basics.hasSchedule),
    },
    venue: {
      mode:
        venue.mode === "existing" && venue.existingVenueId
          ? "existing"
          : "new",
      existingVenueId: venue.existingVenueId ?? null,
      zoneType: reservedIncomplete
        ? "general_admission"
        : (venue.zoneType ?? "general_admission"),
      venueName: (venue.venueName ?? "").trim() || "Por definir",
      venueLocation: venue.venueLocation,
      venueCity: venue.venueCity,
      province: venue.province,
      department: venue.department,
      provinceId: venue.provinceId ?? null,
      departmentId: venue.departmentId ?? null,
      capacity: venue.capacity && venue.capacity > 0 ? venue.capacity : 1,
      customMaxCapacity:
        venue.customMaxCapacity != null && venue.customMaxCapacity > 0
          ? venue.customMaxCapacity
          : null,
      rows: reservedIncomplete ? undefined : venue.rows,
      seatsPerRow: reservedIncomplete ? undefined : venue.seatsPerRow,
      latitude: venue.latitude ?? null,
      longitude: venue.longitude ?? null,
      seatingBackgroundUrl: venue.seatingBackgroundUrl ?? null,
      venueMap: venue.venueMap ?? null,
      seatingLayout: venue.seatingLayout,
      includesSeatingMap: Boolean(venue.includesSeatingMap),
      saveVenueForReuse: venue.saveVenueForReuse ?? true,
      zones: zones as EventFormValues["venue"]["zones"],
    },
    tickets:
      tickets.length > 0 ? tickets : [blankDraftTicket()],
    ticketsDefaultTab:
      raw.ticketsDefaultTab === "seated" ||
      raw.ticketsDefaultTab === "general" ||
      raw.ticketsDefaultTab === "bundle" ||
      raw.ticketsDefaultTab === "addon"
        ? raw.ticketsDefaultTab
        : "auto",
    lineup: Array.isArray(raw.lineup) ? raw.lineup : [],
    maxTicketsPerUser:
      raw.maxTicketsPerUser === undefined
        ? undefined
        : raw.maxTicketsPerUser == null || Number(raw.maxTicketsPerUser) <= 0
          ? null
          : Math.floor(Number(raw.maxTicketsPerUser)),
  } as EventFormValues
}
