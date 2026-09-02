import { z } from "zod"

import {
  ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
  MAX_TABLES_PER_PURCHASE,
  MAX_TICKETS_PER_PURCHASE,
} from "@/lib/checkout-limits"

const MAX_SEATING_UNITS_PER_PURCHASE = Math.max(
  MAX_TABLES_PER_PURCHASE,
  MAX_TICKETS_PER_PURCHASE,
)
import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import {
  DNI_ERROR,
  EMAIL_ERROR,
  isStrictEmail,
  isValidDni,
  normalizeArgentineMobile,
  normalizeDni,
  normalizeEmail,
} from "@/lib/checkout/guest-input"
import { asHoldEventDateId } from "@/lib/checkout/seat-hold-day"

const UUID_ERROR = "Identificador inválido."
const QTY_ERROR = "La cantidad de entradas no es válida."

function sanitizeNamePart(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = sanitizeNamePart(fullName).split(" ").filter(Boolean)
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
}

export const CheckoutBuyerSchema = z.object({
  firstName: z
    .string()
    .transform(sanitizeNamePart)
    .pipe(
      z
        .string()
        .min(1, "Escribí tu nombre completo tal como figura en tu DNI")
        .max(50, "El nombre es demasiado largo."),
    ),
  lastName: z
    .string()
    .transform(sanitizeNamePart)
    .pipe(
      z
        .string()
        .min(1, "Escribí tu apellido tal como figura en tu DNI")
        .max(50, "El apellido es demasiado largo."),
    ),
  email: z
    .string()
    .transform((value) => normalizeEmail(value))
    .refine(isStrictEmail, EMAIL_ERROR),
  dni: z
    .string()
    .transform((value) => normalizeDni(value))
    .refine(isValidDni, DNI_ERROR),
  phone: z
    .string()
    .transform((value) => normalizeArgentineMobile(value) ?? ""),
})

const CheckoutLegacyBuyerSchema = z
  .object({
    buyerName: z.string(),
    buyerEmail: z.string(),
    buyerDni: z.string(),
    buyerPhone: z.string(),
  })
  .transform((legacy) => {
    const names = splitFullName(legacy.buyerName)
    return {
      firstName: names.firstName,
      lastName: names.lastName,
      email: legacy.buyerEmail,
      dni: legacy.buyerDni,
      phone: legacy.buyerPhone,
    }
  })
  .pipe(CheckoutBuyerSchema)

export const CheckoutBuyerInputSchema = z.union([
  CheckoutBuyerSchema,
  CheckoutLegacyBuyerSchema,
])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = asTrimmedString(value)
    if (parsed) return parsed
  }
  return undefined
}

function normalizeIncomingCartItem(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw
  const item = raw as Record<string, unknown>
  const tierId = firstString(
    item.ticket_tier_id,
    item.ticketTierId,
    item.tierId,
    item.ticket_type_id,
    item.ticketTypeId,
  )
  const seatId = firstString(
    item.seat_id,
    item.seatId,
    item.seatingUnitId,
    Array.isArray(item.seatingIds) ? item.seatingIds[0] : undefined,
  )
  const elementId = firstString(item.element_id, item.elementId)
  const zoneIdRaw = firstString(item.zoneId, item.zone_id)
  const explicitType = asTrimmedString(item.type)
  const isMapped =
    explicitType === "mapped" ||
    Boolean(seatId) ||
    Boolean(elementId)
  const quantityRaw = Number(item.quantity)
  return {
    // Client money fields (price, unit_price, total) are dropped on purpose.
    type: isMapped ? "mapped" : "general",
    ticketTierId: tierId,
    ticket_tier_id: tierId,
    tierId,
    quantity: Number.isFinite(quantityRaw) ? quantityRaw : isMapped ? 1 : quantityRaw,
    seatingUnitId: seatId && UUID_RE.test(seatId) ? seatId : undefined,
    seatId: seatId && UUID_RE.test(seatId) ? seatId : undefined,
    seat_id: seatId && UUID_RE.test(seatId) ? seatId : undefined,
    elementId,
    element_id: elementId,
    seatingIds: item.seatingIds,
    sectorKey: firstString(item.sectorKey, item.sector_id, item.sectorId),
    tableNumber: item.tableNumber,
    zoneId:
      zoneIdRaw && UUID_RE.test(zoneIdRaw) ? zoneIdRaw : undefined,
    hasMap: asBoolean(item.hasMap, item.has_map),
    isNumbered: asBoolean(item.isNumbered, item.is_numbered),
    has_map: asBoolean(item.has_map, item.hasMap),
    is_numbered: asBoolean(item.is_numbered, item.isNumbered),
    isMappedSelection: asBoolean(
      item.isMappedSelection,
      item.is_mapped_selection,
    ),
    is_mapped_selection: asBoolean(
      item.is_mapped_selection,
      item.isMappedSelection,
    ),
    eventDateId: asHoldEventDateId(
      firstString(
        item.eventDateId,
        item.event_date_id,
        item.dateId,
        item.scheduleId,
      ),
    ),
    event_date_id: asHoldEventDateId(
      firstString(
        item.event_date_id,
        item.eventDateId,
        item.dateId,
        item.scheduleId,
      ),
    ),
    dateId: asHoldEventDateId(
      firstString(
        item.dateId,
        item.eventDateId,
        item.event_date_id,
        item.scheduleId,
      ),
    ),
  }
}

function asBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value
  }
  return undefined
}

export const CheckoutGeneralItemSchema = z.object({
  type: z.literal("general"),
  ticket_tier_id: z.string().uuid(UUID_ERROR),
  ticketTierId: z.string().uuid(UUID_ERROR),
  tierId: z.string().uuid(UUID_ERROR),
  quantity: z
    .number()
    .int()
    .positive()
    .max(ABSOLUTE_MAX_ITEMS_PER_PURCHASE, QTY_ERROR),
  seatingUnitId: z.string().uuid(UUID_ERROR).optional(),
  seatingIds: z.array(z.string().uuid(UUID_ERROR)).max(1).optional(),
  sectorKey: z.string().trim().max(120).nullable().optional(),
  tableNumber: z.number().int().positive().max(9999).nullable().optional(),
  zoneId: z.string().uuid(UUID_ERROR).nullable().optional(),
  seatId: z.string().uuid(UUID_ERROR).optional(),
  seat_id: z.string().uuid(UUID_ERROR).optional(),
  elementId: z.string().trim().max(200).optional(),
  element_id: z.string().trim().max(200).optional(),
  hasMap: z.boolean().optional(),
  isNumbered: z.boolean().optional(),
  has_map: z.boolean().optional(),
  is_numbered: z.boolean().optional(),
  isMappedSelection: z.boolean().optional(),
  is_mapped_selection: z.boolean().optional(),
  eventDateId: z.string().uuid(UUID_ERROR).optional().nullable(),
  event_date_id: z.string().uuid(UUID_ERROR).optional().nullable(),
  dateId: z.string().uuid(UUID_ERROR).optional().nullable(),
})

export const CheckoutMappedItemSchema = z
  .object({
    type: z.literal("mapped"),
    ticket_tier_id: z.string().uuid(UUID_ERROR),
    ticketTierId: z.string().uuid(UUID_ERROR),
    tierId: z.string().uuid(UUID_ERROR),
    quantity: z.literal(1),
    seatingUnitId: z.string().uuid(UUID_ERROR).optional(),
    seatingIds: z.array(z.string().uuid(UUID_ERROR)).max(1).optional(),
    sectorKey: z.string().trim().max(120).nullable().optional(),
    tableNumber: z.number().int().positive().max(9999).nullable().optional(),
    zoneId: z.string().uuid(UUID_ERROR).nullable().optional(),
    seatId: z.string().uuid(UUID_ERROR).optional(),
    seat_id: z.string().uuid(UUID_ERROR).optional(),
    elementId: z.string().trim().min(1).max(200).optional(),
    element_id: z.string().trim().min(1).max(200).optional(),
    hasMap: z.boolean().optional(),
    isNumbered: z.boolean().optional(),
    has_map: z.boolean().optional(),
    is_numbered: z.boolean().optional(),
    isMappedSelection: z.boolean().optional(),
    is_mapped_selection: z.boolean().optional(),
    eventDateId: z.string().uuid(UUID_ERROR).optional().nullable(),
    event_date_id: z.string().uuid(UUID_ERROR).optional().nullable(),
    dateId: z.string().uuid(UUID_ERROR).optional().nullable(),
  })
  .superRefine((item, ctx) => {
    if (item.isNumbered === false || item.is_numbered === false) return
    const seat =
      item.seatingUnitId ||
      item.seatId ||
      item.seat_id ||
      item.seatingIds?.[0]
    const element = item.elementId || item.element_id
    if (!seat && !element) {
      ctx.addIssue({
        code: "custom",
        path: ["seat_id"],
        message: "Cada ubicación numerada requiere seat_id o element_id.",
      })
    }
  })

export const CheckoutCartItemSchema = z.preprocess(
  normalizeIncomingCartItem,
  z.discriminatedUnion("type", [
    CheckoutGeneralItemSchema,
    CheckoutMappedItemSchema,
  ]),
)

export const CheckoutAddonItemSchema = z.object({
  itemId: z.string().uuid(UUID_ERROR),
  quantity: z.number().int().positive().max(20),
})

/** All-In public price. Gratis (`0`) is valid. Persist/compare via integer cents. */
export const PublicTicketPriceSchema = z
  .number()
  .min(0)
  .transform((value) => centsToMoney(moneyToCents(value)))

export const CheckoutSeatHoldSchema = z.object({
  eventId: z.string().uuid(UUID_ERROR),
  seatingUnitId: z.string().uuid(UUID_ERROR),
})

const optionalHoldEventDateId = z
  .union([z.string().uuid(UUID_ERROR), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null))

export const CheckoutLayoutHoldSchema = z.object({
  eventId: z.string().uuid(UUID_ERROR),
  sectorId: z.string().trim().min(1, UUID_ERROR).max(120),
  layoutItemId: z.string().trim().min(1, UUID_ERROR).max(200),
  eventDateId: optionalHoldEventDateId,
  dateId: optionalHoldEventDateId,
  comboTierId: z.string().uuid(UUID_ERROR).optional(),
})

export const CheckoutLockTicketsSchema = z.object({
  eventId: z.string().uuid(UUID_ERROR),
  items: z
    .array(CheckoutCartItemSchema)
    .min(1, "Datos de compra incompletos.")
    .max(ABSOLUTE_MAX_ITEMS_PER_PURCHASE, QTY_ERROR),
})

export const CheckoutEventIdSchema = z.object({
  eventId: z.string().uuid(UUID_ERROR),
})

function stripCheckoutClientMoneyFields(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw
  const value = { ...(raw as Record<string, unknown>) }
  delete value.totalPrice
  delete value.total_price
  delete value.unitPrice
  delete value.unit_price
  delete value.price
  delete value.clientTotal
  delete value.client_total
  delete value.now
  delete value.nowMs
  delete value.clientNow
  delete value.client_now
  delete value.expiresAt
  delete value.expires_at
  delete value.saleStartsAt
  delete value.sale_starts_at
  delete value.saleEndsAt
  delete value.sale_ends_at
  return value
}

export const CheckoutPayloadSchema = z.preprocess(
  stripCheckoutClientMoneyFields,
  z
  .object({
    eventId: z.string().uuid(UUID_ERROR),
    items: z.array(CheckoutCartItemSchema).max(ABSOLUTE_MAX_ITEMS_PER_PURCHASE).optional(),
    seatingIds: z
      .array(z.string().uuid(UUID_ERROR))
      .max(MAX_SEATING_UNITS_PER_PURCHASE)
      .optional(),
    addons: z.array(CheckoutAddonItemSchema).max(20).optional().default([]),
    buyer: CheckoutBuyerInputSchema,
    referralCode: z
      .string()
      .trim()
      .max(32)
      .nullable()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? ""
        return trimmed.length > 0 ? trimmed : null
      }),
    promoCodeId: z
      .union([z.string().uuid(UUID_ERROR), z.literal(""), z.null()])
      .optional()
      .transform((value) => {
        if (!value) return null
        return value
      }),
    sandbox: z.boolean().optional(),
    termsAccepted: z.boolean().optional(),
    previewKey: z
      .string()
      .uuid(UUID_ERROR)
      .optional()
      .nullable(),
    paymentProvider: z
      .enum(["mercadopago", "payway", "naranjax", "modo"])
      .default("mercadopago"),
    displayedTotal: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    subtotal: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    serviceFee: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    grandTotal: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    ticketPrice: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    feeAmount: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    customerTotal: z
      .number()
      .finite()
      .min(0)
      .optional()
      .transform((value) =>
        value == null ? value : centsToMoney(moneyToCents(value)),
      ),
    lineQuotes: z
      .array(
        z.object({
          ticketTierId: z.string().uuid(UUID_ERROR).optional().nullable(),
          quantity: z
            .number()
            .int()
            .positive()
            .max(ABSOLUTE_MAX_ITEMS_PER_PURCHASE),
          basePrice: z
            .number()
            .finite()
            .min(0)
            .transform((value) => centsToMoney(moneyToCents(value))),
          feeAmount: z
            .number()
            .finite()
            .min(0)
            .transform((value) => centsToMoney(moneyToCents(value))),
          finalPrice: z
            .number()
            .finite()
            .min(0)
            .transform((value) => centsToMoney(moneyToCents(value))),
        }),
      )
      .max(ABSOLUTE_MAX_ITEMS_PER_PURCHASE)
      .optional(),
    idempotencyKey: z.string().uuid(UUID_ERROR).optional().nullable(),
    cartSessionId: z.string().uuid(UUID_ERROR).optional().nullable(),
  })
  .superRefine((payload, ctx) => {
    const items = payload.items ?? []
    const seatingIds = payload.seatingIds ?? []
    const itemSeatIds = items.flatMap((item) => {
      const ids = [...(item.seatingIds ?? [])]
      if (item.seatingUnitId) ids.push(item.seatingUnitId)
      return ids
    })
    const allSeatIds = [
      ...new Set([...seatingIds, ...itemSeatIds]),
    ]

    if (items.length === 0 && seatingIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Datos de compra incompletos.",
      })
      return
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    if (
      items.length > 0 &&
      (totalQuantity < 1 || totalQuantity > ABSOLUTE_MAX_ITEMS_PER_PURCHASE)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: `Podés reservar entre 1 y ${ABSOLUTE_MAX_ITEMS_PER_PURCHASE} entradas por compra.`,
      })
    }

    const seatingLineItems = items.filter(
      (item) =>
        item.type === "mapped" ||
        Boolean(item.seatingUnitId) ||
        Boolean(item.seatId) ||
        Boolean(item.elementId) ||
        (item.seatingIds?.length ?? 0) > 0,
    )
    const seatingUnitIds = seatingLineItems.flatMap((item) => {
      const ids = [...(item.seatingIds ?? [])]
      if (item.seatingUnitId) ids.push(item.seatingUnitId)
      return ids
    })
    const uniqueSeatingUnitIds = new Set(seatingUnitIds)

    if (allSeatIds.length > MAX_SEATING_UNITS_PER_PURCHASE) {
      ctx.addIssue({
        code: "custom",
        path: ["seatingIds"],
        message: `Podés reservar hasta ${MAX_SEATING_UNITS_PER_PURCHASE} ubicaciones numeradas por compra.`,
      })
    }

    if (uniqueSeatingUnitIds.size !== seatingUnitIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "No podés reservar la misma ubicación más de una vez.",
      })
    }

    if (seatingLineItems.some((item) => item.quantity !== 1)) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Cada ubicación numerada requiere cantidad 1.",
      })
    }
  }),
)

export type CheckoutBuyer = z.infer<typeof CheckoutBuyerSchema>
export type CheckoutPayload = z.infer<typeof CheckoutPayloadSchema>
export type CheckoutCartItem = NonNullable<CheckoutPayload["items"]>[number]
export type CheckoutCartItemInput = {
  type?: "general" | "mapped"
  ticket_type_id?: string
  ticketTypeId?: string
  ticket_tier_id?: string
  ticketTierId?: string
  tierId?: string
  quantity: number
  seatingUnitId?: string
  seatingIds?: string[]
  sectorKey?: string | null
  sector_id?: string | null
  sectorId?: string | null
  tableNumber?: number | null
  zoneId?: string | null
  seatId?: string
  seat_id?: string
  elementId?: string
  element_id?: string
  hasMap?: boolean
  isNumbered?: boolean
  has_map?: boolean
  is_numbered?: boolean
  isMappedSelection?: boolean
  is_mapped_selection?: boolean
  eventDateId?: string | null
  event_date_id?: string | null
  dateId?: string | null
  scheduleId?: string | null
}
export type CheckoutAddonItem = CheckoutPayload["addons"][number]

export const CHECKOUT_INVALID_PAYLOAD_ERROR = "Datos de compra inválidos."

export function checkoutTermsAreAccepted(input: {
  termsAccepted?: boolean | null
  isFreeOrder?: boolean
  sandbox?: boolean
}): boolean {
  if (input.isFreeOrder || input.sandbox) return true
  return input.termsAccepted === true
}

export function formatCheckoutPayloadError(
  error: z.ZodError,
): string {
  const first = error.issues[0]?.message?.trim()
  if (
    first &&
    first.length > 0 &&
    first.length <= 140 &&
    !/zod|uuid|regex|expected/i.test(first)
  ) {
    return first
  }
  return CHECKOUT_INVALID_PAYLOAD_ERROR
}

export function buyerToHolderFields(buyer: CheckoutBuyer): {
  buyerName: string
  buyerDni: string
  buyerEmail: string
  buyerPhone: string
} {
  return {
    buyerName: `${buyer.firstName} ${buyer.lastName}`.replace(/\s+/g, " ").trim(),
    buyerDni: buyer.dni,
    buyerEmail: buyer.email,
    buyerPhone: buyer.phone,
  }
}
