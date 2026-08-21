import { z } from "zod"

import { isStrictEmail, normalizeEmail } from "@/lib/checkout/guest-input"
import { POS_RPC_QTY_CAP } from "@/lib/pos-cart"

const UUID_ERROR = "Identificador inválido."
const POS_INVALID_ERROR = "Datos de venta inválidos."

const uuid = z.string().uuid(UUID_ERROR)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? ""
      return trimmed.length > 0 ? trimmed : null
    })

export const PosSaleInputSchema = z.object({
  eventId: uuid,
  tierId: uuid,
  quantity: z
    .number()
    .int()
    .min(1, "Ingresá al menos una entrada.")
    .max(POS_RPC_QTY_CAP, `Máximo ${POS_RPC_QTY_CAP} entradas por cobro.`),
  paymentMethod: z.enum(
    ["cash", "card", "transfer", "cash_pos", "card_pos", "transfer_pos"],
    { error: "Método de pago presencial inválido." },
  ),
  customerPhone: optionalText(30),
  customerEmail: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? ""
      return trimmed.length > 0 ? normalizeEmail(trimmed) : null
    })
    .refine(
      (value) => value == null || isStrictEmail(value),
      "Escribí un correo válido (ej: nombre@gmail.com)",
    ),
  customerDni: optionalText(16),
  customerName: optionalText(80),
  shiftId: uuid,
  supervisorPin: optionalText(12),
  seatingLayoutItemId: optionalText(80),
  seatingUnitId: z
    .union([uuid, z.literal(""), z.null()])
    .optional()
    .transform((value) => {
      if (!value) return null
      return value
    }),
})

export const OpenCashierShiftSchema = z.object({
  eventId: uuid,
  startAmount: z
    .number()
    .finite()
    .min(0, "Ingresá un fondo inicial válido.")
    .max(99_999_999, "Ingresá un fondo inicial válido."),
})

export const CloseCashierShiftSchema = z.object({
  shiftId: uuid,
  countedAmount: z
    .number()
    .finite()
    .min(0, "Ingresá un monto contado válido.")
    .max(99_999_999, "Ingresá un monto contado válido.")
    .optional()
    .nullable(),
})

export const VoidPosOrderSchema = z.object({
  orderId: uuid,
  supervisorPin: z
    .string()
    .trim()
    .min(4, "Ingresá el PIN de Autorización.")
    .max(12, "Ingresá el PIN de Autorización."),
})

export const PosSupervisorPinSchema = z.object({
  eventId: uuid,
  pin: z
    .string()
    .trim()
    .min(4, "El PIN tiene que tener entre 4 y 12 caracteres.")
    .max(12, "El PIN tiene que tener entre 4 y 12 caracteres."),
})

export const PosCashierPinSchema = z.object({
  eventId: uuid,
  pin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Ingresá el PIN de 4 dígitos."),
})

export const BootstrapPosCashierPinSchema = z.object({
  eventId: uuid,
  newPin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "El PIN de caja debe tener 4 dígitos."),
  adminPin: optionalText(12),
})

export const DeliverPosTicketsSchema = z.object({
  eventTitle: z.string().trim().min(1).max(160),
  ticketIds: z.array(uuid).min(1).max(40),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? ""
      return trimmed.length > 0 ? normalizeEmail(trimmed) : null
    })
    .refine(
      (value) => value == null || isStrictEmail(value),
      "Escribí un correo válido (ej: nombre@gmail.com)",
    ),
})

export type PosSaleInput = z.infer<typeof PosSaleInputSchema>

export function formatPosValidationError(error: z.ZodError): string {
  const first = error.issues[0]?.message?.trim()
  if (
    first &&
    first.length > 0 &&
    first.length <= 140 &&
    !/zod|uuid|regex|expected/i.test(first)
  ) {
    return first
  }
  return POS_INVALID_ERROR
}
