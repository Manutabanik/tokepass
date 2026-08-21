import { z } from "zod"

import {
  EMAIL_ERROR,
  isStrictEmail,
  normalizeArgentineMobile,
  normalizeEmail,
} from "@/lib/checkout/guest-input"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function sanitizeFreepassWhatsapp(
  raw: string | null | undefined,
): string | null {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return null

  const normalized = normalizeArgentineMobile(trimmed)
  if (normalized) return normalized

  const digits = trimmed.replace(/\D/g, "")
  if (digits.length >= 8 && digits.length <= 15) return digits
  return null
}

export const freepassRegisterSchema = z.object({
  listId: z
    .string()
    .trim()
    .refine((value) => UUID_RE.test(value), "El enlace de la lista no es válido."),
  fullName: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre completo.")
    .max(120, "El nombre es demasiado largo."),
  email: z
    .string()
    .trim()
    .transform((value) => normalizeEmail(value))
    .refine(isStrictEmail, EMAIL_ERROR),
  phone: z
    .string()
    .optional()
    .nullable()
    .transform((value) => sanitizeFreepassWhatsapp(value)),
  promoterId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      const id = value?.trim() ?? ""
      if (!id) return null
      return UUID_RE.test(id) ? id : null
    }),
})

export type FreepassRegisterInput = z.infer<typeof freepassRegisterSchema>

export function firstZodIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos del formulario."
}
