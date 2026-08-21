import { z } from "zod"

import {
  DNI_ERROR,
  EMAIL_ERROR,
  PHONE_ERROR,
  isStrictEmail,
  isValidDni,
  normalizeArgentineMobile,
  normalizeDni,
  normalizeEmail,
} from "@/lib/checkout/guest-input"
import {
  firstCheckoutBuyerErrorField,
  type CheckoutBuyerField,
} from "@/lib/checkout/validation-scroll"

export type CheckoutBuyerInfo = {
  buyerName: string
  buyerDni: string
  buyerEmail: string
  buyerPhone: string
}

export type NormalizedCheckoutBuyer = {
  buyerName: string
  buyerDni: string
  buyerEmail: string
  buyerPhone: string
}

export const checkoutBuyerFormSchema = z.object({
  buyerName: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(3, "Escribí tu nombre y apellido tal como figuran en tu DNI")
        .refine(
          (value) => value.split(" ").filter(Boolean).length >= 2,
          "Escribí tu nombre y apellido tal como figuran en tu DNI",
        ),
    ),
  buyerDni: z
    .string()
    .transform((value) => normalizeDni(value))
    .refine(isValidDni, DNI_ERROR),
  buyerPhone: z
    .string()
    .transform((value) => normalizeArgentineMobile(value) ?? "")
    .refine((value) => value.length > 0, PHONE_ERROR),
  buyerEmail: z
    .string()
    .transform((value) => normalizeEmail(value))
    .refine(isStrictEmail, EMAIL_ERROR),
})

export type CheckoutBuyerFormValues = z.infer<typeof checkoutBuyerFormSchema>

export function normalizeCheckoutBuyer(
  input: Partial<CheckoutBuyerInfo> | null | undefined,
): NormalizedCheckoutBuyer | null {
  if (!input) return null
  const buyerName = input.buyerName?.trim().replace(/\s+/g, " ") ?? ""
  const buyerDni = normalizeDni(input.buyerDni ?? "")
  const buyerEmail = normalizeEmail(input.buyerEmail ?? "")
  const buyerPhone = normalizeArgentineMobile(input.buyerPhone ?? "") ?? ""

  if (!buyerName && !buyerDni && !buyerEmail && !buyerPhone) return null

  return { buyerName, buyerDni, buyerEmail, buyerPhone }
}

export function getCheckoutBuyerFieldErrors(
  input: Partial<CheckoutBuyerInfo> | null | undefined,
): Partial<Record<CheckoutBuyerField, string>> {
  const parsed = checkoutBuyerFormSchema.safeParse({
    buyerName: input?.buyerName ?? "",
    buyerDni: input?.buyerDni ?? "",
    buyerPhone: input?.buyerPhone ?? "",
    buyerEmail: input?.buyerEmail ?? "",
  })
  if (parsed.success) return {}

  const errors: Partial<Record<CheckoutBuyerField, string>> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (
      key === "buyerName" ||
      key === "buyerDni" ||
      key === "buyerPhone" ||
      key === "buyerEmail"
    ) {
      errors[key] ??= issue.message
    }
  }
  if (Object.keys(errors).length === 0) {
    errors.buyerName = "Falta completar este dato"
  }
  return errors
}

export function validateCheckoutBuyer(
  input: Partial<CheckoutBuyerInfo> | null | undefined,
): { ok: true; buyer: NormalizedCheckoutBuyer } | { ok: false; error: string } {
  const errors = getCheckoutBuyerFieldErrors(input)
  const firstField = firstCheckoutBuyerErrorField(errors)
  if (firstField && errors[firstField]) {
    return { ok: false, error: errors[firstField] }
  }

  const buyer = normalizeCheckoutBuyer(input)
  if (!buyer) {
    return {
      ok: false,
      error: "Falta completar este dato",
    }
  }

  return { ok: true, buyer }
}

/** external_reference MP: JSON con orderId + identidad (webhook parsea ambos formatos). */
export function buildPaymentExternalReference(input: {
  orderId: string
  userId: string
  buyer?: NormalizedCheckoutBuyer | null
}): string {
  return JSON.stringify({
    orderId: input.orderId,
    userId: input.userId,
    buyerName: input.buyer?.buyerName ?? null,
    buyerDni: input.buyer?.buyerDni ?? null,
    buyerEmail: input.buyer?.buyerEmail ?? null,
  })
}

export function parsePaymentExternalReference(raw: string): {
  orderId: string | null
  buyerName: string | null
  buyerDni: string | null
  buyerEmail: string | null
} {
  const trimmed = raw.trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return {
      orderId: trimmed,
      buyerName: null,
      buyerDni: null,
      buyerEmail: null,
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      orderId?: unknown
      userId?: unknown
      buyerName?: unknown
      buyerDni?: unknown
      buyerEmail?: unknown
    }
    const orderId =
      typeof parsed.orderId === "string" && parsed.orderId.trim()
        ? parsed.orderId.trim()
        : null
    return {
      orderId,
      buyerName:
        typeof parsed.buyerName === "string" ? parsed.buyerName.trim() || null : null,
      buyerDni:
        typeof parsed.buyerDni === "string"
          ? parsed.buyerDni.replace(/\D/g, "") || null
          : null,
      buyerEmail:
        typeof parsed.buyerEmail === "string"
          ? parsed.buyerEmail.trim().toLowerCase() || null
          : null,
    }
  } catch {
    return {
      orderId: null,
      buyerName: null,
      buyerDni: null,
      buyerEmail: null,
    }
  }
}
