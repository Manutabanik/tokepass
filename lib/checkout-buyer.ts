import { z } from "zod"

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
        .min(3, "Ingresá el nombre y apellido del asistente.")
        .refine(
          (value) => value.split(" ").filter(Boolean).length >= 2,
          "Ingresá el nombre y apellido del asistente.",
        ),
    ),
  buyerDni: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d{7,9}$/, "El DNI debe tener entre 7 y 9 dígitos."),
    ),
  buyerPhone: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d{8,15}$/, "Ingresá un teléfono / WhatsApp válido."),
    ),
  buyerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Ingresá un email válido para la confirmación."),
})

export type CheckoutBuyerFormValues = z.infer<typeof checkoutBuyerFormSchema>

export function normalizeCheckoutBuyer(
  input: Partial<CheckoutBuyerInfo> | null | undefined,
): NormalizedCheckoutBuyer | null {
  if (!input) return null
  const buyerName = input.buyerName?.trim().replace(/\s+/g, " ") ?? ""
  const buyerDni = (input.buyerDni ?? "").replace(/\D/g, "")
  const buyerEmail = input.buyerEmail?.trim().toLowerCase() ?? ""
  const buyerPhone = (input.buyerPhone ?? "").replace(/\D/g, "")

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
    errors.buyerName = "Completá nombre, DNI, teléfono y email del asistente."
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
      error: "Completá nombre, DNI, teléfono y email del asistente.",
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
