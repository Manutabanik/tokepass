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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

export function validateCheckoutBuyer(
  input: Partial<CheckoutBuyerInfo> | null | undefined,
): { ok: true; buyer: NormalizedCheckoutBuyer } | { ok: false; error: string } {
  const buyer = normalizeCheckoutBuyer(input)
  if (!buyer) {
    return {
      ok: false,
      error: "Completá nombre, DNI, teléfono y email del asistente.",
    }
  }

  if (buyer.buyerName.length < 3) {
    return {
      ok: false,
      error: "Ingresá el nombre y apellido del asistente.",
    }
  }

  if (buyer.buyerDni.length < 7 || buyer.buyerDni.length > 10) {
    return {
      ok: false,
      error: "El DNI debe tener entre 7 y 10 dígitos.",
    }
  }

  if (buyer.buyerPhone.length < 8 || buyer.buyerPhone.length > 15) {
    return {
      ok: false,
      error: "Ingresá un teléfono / WhatsApp válido.",
    }
  }

  if (!EMAIL_RE.test(buyer.buyerEmail)) {
    return {
      ok: false,
      error: "Ingresá un email válido para la confirmación.",
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
