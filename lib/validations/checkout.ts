import { z } from "zod"

import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"

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
        .min(1, "Ingresá el nombre del asistente.")
        .max(50, "El nombre es demasiado largo."),
    ),
  lastName: z
    .string()
    .transform(sanitizeNamePart)
    .pipe(
      z
        .string()
        .min(1, "Ingresá el apellido del asistente.")
        .max(50, "El apellido es demasiado largo."),
    ),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Ingresá un email válido para la confirmación."),
  dni: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d{7,9}$/, "El DNI debe tener entre 7 y 9 dígitos."),
    ),
  phone: z
    .string()
    .optional()
    .transform((value) => {
      const digits = (value ?? "").replace(/\D/g, "")
      return digits.length > 0 ? digits : undefined
    })
    .pipe(
      z
        .string()
        .regex(/^\d{8,15}$/, "Ingresá un teléfono / WhatsApp válido.")
        .optional(),
    ),
})

const CheckoutLegacyBuyerSchema = z
  .object({
    buyerName: z.string(),
    buyerEmail: z.string(),
    buyerDni: z.string(),
    buyerPhone: z.string().optional(),
  })
  .transform((legacy) => {
    const names = splitFullName(legacy.buyerName)
    return {
      firstName: names.firstName,
      lastName: names.lastName,
      email: legacy.buyerEmail,
      dni: legacy.buyerDni,
      ...(legacy.buyerPhone ? { phone: legacy.buyerPhone } : {}),
    }
  })
  .pipe(CheckoutBuyerSchema)

export const CheckoutBuyerInputSchema = z.union([
  CheckoutBuyerSchema,
  CheckoutLegacyBuyerSchema,
])

export const CheckoutCartItemSchema = z.object({
  tierId: z.string().uuid(UUID_ERROR),
  quantity: z.number().int().positive().max(MAX_TICKETS_PER_PURCHASE, QTY_ERROR),
  seatingUnitId: z.string().uuid(UUID_ERROR).optional(),
  seatingIds: z.array(z.string().uuid(UUID_ERROR)).max(1).optional(),
  sectorKey: z.string().trim().max(120).nullable().optional(),
  tableNumber: z.number().int().positive().max(9999).nullable().optional(),
  zoneId: z.string().uuid(UUID_ERROR).nullable().optional(),
})

export const CheckoutAddonItemSchema = z.object({
  itemId: z.string().uuid(UUID_ERROR),
  quantity: z.number().int().positive().max(20),
})

export const CheckoutPayloadSchema = z
  .object({
    eventId: z.string().uuid(UUID_ERROR),
    items: z.array(CheckoutCartItemSchema).max(MAX_TICKETS_PER_PURCHASE).optional(),
    seatingIds: z.array(z.string().uuid(UUID_ERROR)).max(1).optional(),
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
    paymentProvider: z
      .enum(["mercadopago", "payway", "naranjax", "modo"])
      .default("mercadopago"),
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
    if (items.length > 0 && (totalQuantity < 1 || totalQuantity > MAX_TICKETS_PER_PURCHASE)) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: `Podés reservar entre 1 y ${MAX_TICKETS_PER_PURCHASE} entradas por compra.`,
      })
    }

    if (allSeatIds.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["seatingIds"],
        message: "Comprá una ubicación numerada por operación.",
      })
    }

    const seatingLineItems = items.filter(
      (item) => item.seatingUnitId || (item.seatingIds?.length ?? 0) > 0,
    )
    if (seatingLineItems.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Comprá una ubicación numerada por operación.",
      })
    } else if (
      seatingLineItems.length === 1 &&
      seatingLineItems[0]?.quantity !== 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Comprá una ubicación numerada por operación.",
      })
    }
  })

export type CheckoutBuyer = z.infer<typeof CheckoutBuyerSchema>
export type CheckoutPayload = z.infer<typeof CheckoutPayloadSchema>
export type CheckoutCartItem = NonNullable<CheckoutPayload["items"]>[number]
export type CheckoutAddonItem = CheckoutPayload["addons"][number]

export const CHECKOUT_INVALID_PAYLOAD_ERROR = "Datos de compra inválidos."

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
    buyerPhone: buyer.phone ?? "",
  }
}
