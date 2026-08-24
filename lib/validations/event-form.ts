import { z } from "zod"

import {
  computeEventCapacity,
  eventCapacityOverflowMessage,
  asPositiveInt,
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
import {
  isActiveInventoryTicket,
  isPassOrComboTicket,
  scheduleDaysMissingTicketsMessage,
} from "@/lib/inventory/day-ticket-coverage"
import { INVENTORY_TIER_TYPES } from "@/lib/inventory/unified-inventory"
import {
  TICKET_CALCULATION_MODES,
  TICKET_FEE_STRATEGIES,
} from "@/lib/pricing/flexible-pricing"
import {
  normalizeScheduleDaysFromForm,
  parseDateTimeLocal,
  remapBoundDayId,
  scheduleDaysToFormValues,
} from "@/lib/event-schedule"
import { parseSaleInstant } from "@/lib/inventory/ticket-sale-window"
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
import { validateSectorModalities } from "@/lib/seating/seating-type"
import {
  EMPTY_MAP_ENABLE_ERROR,
  eventHasActiveSeatingMap,
  ticketsReferenceMapSectors,
  venueMapHasConfiguredSectors,
} from "@/lib/inventory/map-enablement"
import { EVENT_VISIBILITY_VALUES } from "@/types/events"
import { parseVenueMap } from "@/types/venue-map"
import { TICKET_TIER_VISIBILITY_VALUES } from "@/types/tickets"
import {
  EVENT_DELIVERY_MODES,
  isOnlineDelivery,
  normalizeAccessLink,
} from "@/lib/events/delivery-mode"
import {
  MISSING_EVENT_FLYER,
  MISSING_EVENT_LOCATION,
  MISSING_SELLABLE_TICKET,
} from "@/lib/events/validate-event-publish"

export const EVENT_REFUND_POLICIES = [
  "organizer",
  "no_refunds",
  "until_24h",
] as const

export type EventRefundPolicy = (typeof EVENT_REFUND_POLICIES)[number]

export function parseEventRefundPolicy(value: unknown): EventRefundPolicy {
  return value === "no_refunds" || value === "until_24h" || value === "organizer"
    ? value
    : "organizer"
}

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
    .min(1, "Elegí la fecha y hora de inicio del evento")
    .refine(
      (value) => parseDateTimeLocal(value) != null,
      "Elegí la fecha y hora de inicio del evento",
    ),
  endTime: z
    .string()
    .min(1, "Elegí la fecha y hora de cierre del evento")
    .refine(
      (value) => parseDateTimeLocal(value) != null,
      "Elegí la fecha y hora de cierre del evento",
    ),
})

const coerceTicketCapacity = z.coerce
  .number({ error: "Indicá cuántas entradas vas a poner a la venta" })
  .int()
  .min(1, "Indicá cuántas entradas vas a poner a la venta")

const coerceOptionalTicketCapacity = z.coerce.number().int().optional()

const coerceVenueCapacity = z.coerce.number().int().positive().optional()

const coerceZoneCapacity = z.coerce.number().int().positive()

export const ticketPhaseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Nombrá el lote."),
  price: z
    .number({ error: "Ingresá un precio válido o marcá la opción de entrada gratuita" })
    .min(0, "Ingresá un precio válido o marcá la opción de entrada gratuita"),
  capacityLimit: coerceTicketCapacity,
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
    .number({ error: "Ingresá un precio válido o marcá la opción de entrada gratuita" })
    .min(0, "Ingresá un precio válido o marcá la opción de entrada gratuita"),
  /** Neto del organizador. El persist lo mapea a ticket_tiers.base_price. */
  basePrice: z.number().min(0).optional(),
  feeStrategy: z.enum(TICKET_FEE_STRATEGIES).optional().default("absorb_in_price"),
  calculationMode: z
    .enum(TICKET_CALCULATION_MODES)
    .optional()
    .default("public_price"),
  capacity: coerceTicketCapacity,
  sold: z.number().int().min(0).optional(),
  timeLimit: z.string().optional(),
  /** datetime-local. Vacío = inmediato. */
  saleStartsAt: z.string().optional().default(""),
  /** datetime-local. Vacío = hasta la fecha del evento. */
  saleEndsAt: z.string().optional().default(""),
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
  }).superRefine((tier, context) => {
    const start = parseSaleInstant(tier.saleStartsAt)
    const end = parseSaleInstant(tier.saleEndsAt)
    if (start && end && end.getTime() <= start.getTime()) {
      context.addIssue({
        code: "custom",
        path: ["saleEndsAt"],
        message: "El fin de venta debe ser posterior al inicio.",
      })
    }
  }),
)

const eventFormObject = z
  .object({
    basics: z.object({
      title: z
        .string()
        .trim()
        .min(3, "Ponéle un nombre a tu evento para poder avanzar"),
      date: z.string(),
      /** Hora de cierre (solo jornada única). */
      endDate: z.string(),
      description: z
        .string()
        .trim()
        .max(2000, "La descripción es demasiado extensa.")
        .optional()
        .default(""),
      flyerName: z.string().nullable().optional().default(null),
      visibility: z.enum(EVENT_VISIBILITY_VALUES),
      isMultiDay: z.boolean(),
      scheduleDays: z.array(scheduleDaySchema),
      categoryId: z.preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? "" : value),
        z.string().optional().default(""),
      ),
      ageRestriction: z
        .union([z.enum(AGE_RESTRICTION_VALUES), z.literal("")])
        .optional()
        .default(""),
      hasSeatingPlan: z.boolean().optional().default(false),
      hasSchedule: z.boolean().optional().default(false),
      deliveryMode: z.enum(EVENT_DELIVERY_MODES).optional().default("PRESENCIAL"),
      accessLink: z.string().optional().default(""),
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
      capacity: coerceVenueCapacity,
      customMaxCapacity: z.coerce.number().int().min(0).nullable().optional(),
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
            capacity: coerceZoneCapacity,
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
    maxTicketsPerUser: z.number().int().nullable().optional(),
    acceptsMercadoPago: z.boolean().optional().default(true),
    acceptsPosPayments: z.boolean().optional().default(true),
    defaultFeeStrategy: z
      .enum(TICKET_FEE_STRATEGIES)
      .optional()
      .default("absorb_in_price"),
    serviceFeePercentage: z.coerce
      .number()
      .min(0, "La comisión no puede ser negativa.")
      .max(95, "La comisión no puede superar el 95%.")
      .optional()
      .default(15),
    refundPolicy: z
      .enum(EVENT_REFUND_POLICIES)
      .optional()
      .default("organizer"),
  })
  .superRefine((data, context) => {
    const tierNames = new Set<string>()
    for (const [index, tier] of data.tickets.entries()) {
      const normalizedName = tier.name.trim().toLocaleLowerCase("es")
      const nameScope = isPassOrComboTicket(tier)
        ? "pass"
        : (tier.dayId?.trim() || "none")
      const nameKey = `${nameScope}::${normalizedName}`
      if (tierNames.has(nameKey)) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "name"],
          message: "Los nombres de las entradas deben ser únicos en la misma jornada.",
        })
      }
      tierNames.add(nameKey)
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
            message: "La hora de cierre tiene que ser posterior a la de inicio",
          })
        }
      }
    }

    const scheduledDays = data.basics.isMultiDay
      ? data.basics.scheduleDays
      : []
    if (scheduledDays.length >= 2) {
      const uncoveredDays = scheduleDaysMissingTicketsMessage(
        scheduledDays,
        data.tickets,
      )
      if (uncoveredDays) {
        context.addIssue({
          code: "custom",
          path: ["tickets"],
          message: uncoveredDays,
        })
      }
    }

    if (!data.basics.isMultiDay) {
      const date = data.basics.date?.trim() ?? ""
      const dateMs = parseDateTimeLocal(date)?.getTime() ?? NaN
      if (!date || Number.isNaN(dateMs)) {
        context.addIssue({
          code: "custom",
          path: ["basics", "date"],
          message: "Elegí la fecha y hora de inicio del evento",
        })
      }

      const endDate = data.basics.endDate?.trim() ?? ""
      const endMs = parseDateTimeLocal(endDate)?.getTime() ?? NaN
      if (!endDate || Number.isNaN(endMs)) {
        context.addIssue({
          code: "custom",
          path: ["basics", "endDate"],
          message: "Elegí la fecha y hora de cierre del evento",
        })
      } else if (date && endMs <= dateMs) {
        context.addIssue({
          code: "custom",
          path: ["basics", "endDate"],
          message: "La hora de cierre tiene que ser posterior a la de inicio",
        })
      }
    }

    if (!(data.basics.flyerName ?? "").trim()) {
      context.addIssue({
        code: "custom",
        path: ["basics", "flyerName"],
        message: MISSING_EVENT_FLYER,
      })
    }

    if (!isOnlineDelivery(data.basics.deliveryMode)) {
      const venueOk = Boolean(
        data.venue.existingVenueId?.trim() &&
          data.venue.venueName.trim() &&
          (data.venue.venueLocation ?? "").trim(),
      )
      const locationOk =
        (data.venue.venueLocation ?? "").trim().length >= 3 ||
        data.venue.venueName.trim().length >= 3
      if (!venueOk && !locationOk) {
        context.addIssue({
          code: "custom",
          path: ["venue", "venueName"],
          message: MISSING_EVENT_LOCATION,
        })
      }
    }

    const sellableActive = data.tickets.filter(
      (ticket) =>
        isActiveInventoryTicket(ticket) &&
        Number.isFinite(Number(ticket.price)) &&
        Number(ticket.price) >= 0 &&
        Number.isFinite(Number(ticket.capacity)) &&
        Number(ticket.capacity) > 0,
    )
    if (sellableActive.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["tickets"],
        message: MISSING_SELLABLE_TICKET,
      })
    }

    if (data.basics.deliveryMode === "ONLINE") {
      const link = (data.basics.accessLink ?? "").trim()
      if (link && !normalizeAccessLink(link)) {
        context.addIssue({
          code: "custom",
          path: ["basics", "accessLink"],
          message: "Ingresá un link http(s) válido.",
        })
      }
    }

    if (data.basics.deliveryMode !== "ONLINE" && data.basics.hasSeatingPlan) {
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
    if (
      data.basics.deliveryMode !== "ONLINE" &&
      usesSeatingMap &&
      !venueMapHasConfiguredSectors(data.venue.venueMap)
    ) {
      context.addIssue({
        code: "custom",
        path: ["venue", "venueMap"],
        message: EMPTY_MAP_ENABLE_ERROR,
      })
    }
    // Adicionales (tierType addon) viven en tickets[] pero no consumen aforo físico.
    const capacitySnap = computeEventCapacity({
      tickets: data.tickets,
      venueMap: data.basics.hasSeatingPlan ? data.venue.venueMap : null,
      zones: data.basics.hasSeatingPlan ? data.venue.zones : null,
      hasSeatingPlan: Boolean(data.basics.hasSeatingPlan),
      baseVenueCapacity: data.venue.capacity,
      customMaxCapacity: data.venue.customMaxCapacity,
    })
    if (data.basics.deliveryMode !== "ONLINE" && capacitySnap.exceeded) {
      context.addIssue({
        code: "custom",
        path: ["tickets"],
        message: eventCapacityOverflowMessage(capacitySnap),
      })
    }

    for (const [index, tier] of data.tickets.entries()) {
      const phases = tier.phases ?? []
      const phaseSum = phases.reduce(
        (sum, phase) => sum + asPositiveInt(phase.capacityLimit),
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

      if (data.basics.deliveryMode === "ONLINE") continue
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
      data.basics.deliveryMode !== "ONLINE" &&
      eventHasActiveSeatingMap({
        hasSeatingPlan: data.basics.hasSeatingPlan,
        includesSeatingMap: data.venue.includesSeatingMap,
        venueMap: data.venue.venueMap,
      }) &&
      ticketsReferenceMapSectors(data.tickets)
    ) {
      for (const issue of validateSectorModalities(
        parseVenueMap(data.venue.venueMap),
      )) {
        context.addIssue({
          code: "custom",
          path: ["venue", "venueMap"],
          message: issue.message,
        })
      }
    }

    if (
      data.basics.deliveryMode !== "ONLINE" &&
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
  price: z
    .number()
    .min(0, "Ingresá un precio válido o marcá la opción de entrada gratuita")
    .optional(),
  basePrice: z.number().min(0).optional(),
  feeStrategy: z.enum(TICKET_FEE_STRATEGIES).optional().default("absorb_in_price"),
  calculationMode: z
    .enum(TICKET_CALCULATION_MODES)
    .optional()
    .default("public_price"),
  capacity: coerceOptionalTicketCapacity,
  sold: z.number().int().min(0).optional(),
  timeLimit: z.string().optional(),
  saleStartsAt: z.string().optional().default(""),
  saleEndsAt: z.string().optional().default(""),
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
      .min(3, "Ponéle un nombre a tu evento para poder avanzar"),
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
    deliveryMode: z.enum(EVENT_DELIVERY_MODES).optional().default("PRESENCIAL"),
    accessLink: z.string().optional().default(""),
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
      capacity: coerceOptionalTicketCapacity,
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
  maxTicketsPerUser: z.number().int().nullable().optional(),
  acceptsMercadoPago: z.boolean().optional().default(true),
  acceptsPosPayments: z.boolean().optional().default(true),
  defaultFeeStrategy: z
    .enum(TICKET_FEE_STRATEGIES)
    .optional()
    .default("absorb_in_price"),
  serviceFeePercentage: z.coerce
    .number()
    .min(0)
    .max(95)
    .optional()
    .default(15),
  refundPolicy: z.enum(EVENT_REFUND_POLICIES).optional().default("organizer"),
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
    basePrice: 0,
    feeStrategy: "pass_to_customer",
    calculationMode: "net_income",
    capacity: 1,
    timeLimit: "",
    saleStartsAt: "",
    saleEndsAt: "",
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

function isPristinePlaceholderTicket(
  tier: EventFormValues["tickets"][number] | DraftEventFormValues["tickets"][number],
): boolean {
  if (tier.id) return false
  if ((tier.name ?? "").trim().length > 0) return false
  if (Number(tier.price) > 0 || Number(tier.basePrice) > 0) return false
  if (resolveTicketSectorId(tier)) return false
  if (tier.layoutType === "table_combo" || tier.layoutType === "numbered_seat") {
    return false
  }
  if (tier.dayId) return false
  if (tier.tierType && tier.tierType !== "general") return false
  const capacity = Number(tier.capacity)
  return !Number.isFinite(capacity) || capacity <= 1
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
    .filter((tier) => !isPristinePlaceholderTicket(tier))
    .map((tier) => {
      const name = (tier.name ?? "").trim()
      const seatingSectorId = resolveTicketSectorId(tier)
      const incomplete = name.length < 2
      return {
        ...blankDraftTicket(),
        ...tier,
        name: name || "Borrador",
        price: Number.isFinite(Number(tier.price)) ? Number(tier.price) : 0,
        basePrice: Number.isFinite(Number(tier.basePrice))
          ? Number(tier.basePrice)
          : 0,
        feeStrategy: tier.feeStrategy ?? "pass_to_customer",
        calculationMode: tier.calculationMode ?? "net_income",
        capacity:
          Number.isFinite(Number(tier.capacity)) && Number(tier.capacity) >= 1
            ? Number(tier.capacity)
            : 1,
        layoutType:
          tier.layoutType === "table_combo" || tier.layoutType === "numbered_seat"
            ? tier.layoutType
            : "general",
        visibility: incomplete
          ? "private"
          : (tier.visibility ?? "public"),
        capacityPerUnit: tier.capacityPerUnit ?? 1,
        minPurchaseLimit: Math.max(
          1,
          Math.floor(Number(tier.minPurchaseLimit) || 1),
        ),
        maxPurchaseLimit:
          tier.maxPurchaseLimit == null || Number(tier.maxPurchaseLimit) <= 0
            ? null
            : Math.floor(Number(tier.maxPurchaseLimit)),
        admitCount: tier.admitCount ?? 1,
        saleStartsAt: tier.saleStartsAt ?? "",
        saleEndsAt: tier.saleEndsAt ?? "",
        seatingSectorId,
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
        description: (tier.description ?? "")
          .trim()
          .slice(0, TICKET_DESCRIPTION_MAX),
        highlightBadge: tier.highlightBadge === "bestseller" ? "bestseller" : null,
        dayId: isPassOrComboTicket(tier)
          ? null
          : isMultiDay
            ? remapBoundDayId(asUuidOrNull(tier.dayId, ["all"]), validDayIds)
            : null,
        phases: tier.phases ?? [],
      }
    })

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
      deliveryMode:
        raw.basics.deliveryMode === "ONLINE" ? "ONLINE" : "PRESENCIAL",
      accessLink: raw.basics.accessLink ?? "",
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
    tickets,
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
    acceptsMercadoPago: raw.acceptsMercadoPago !== false,
    acceptsPosPayments: raw.acceptsPosPayments !== false,
    defaultFeeStrategy:
      raw.defaultFeeStrategy === "pass_to_customer"
        ? "pass_to_customer"
        : "absorb_in_price",
    serviceFeePercentage: (() => {
      const parsed = Number(raw.serviceFeePercentage)
      if (!Number.isFinite(parsed)) return 15
      return Math.min(95, Math.max(0, parsed))
    })(),
    refundPolicy:
      raw.refundPolicy === "no_refunds" || raw.refundPolicy === "until_24h"
        ? raw.refundPolicy
        : "organizer",
  } as EventFormValues
}
