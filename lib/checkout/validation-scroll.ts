export const CHECKOUT_BUYER_FIELD_IDS = {
  buyerName: "buyer-name",
  buyerDni: "buyer-dni",
  buyerPhone: "buyer-phone",
  buyerEmail: "buyer-email",
} as const

export type CheckoutBuyerField = keyof typeof CHECKOUT_BUYER_FIELD_IDS

const FIELD_ORDER: CheckoutBuyerField[] = [
  "buyerEmail",
  "buyerName",
  "buyerDni",
  "buyerPhone",
]

export function firstCheckoutBuyerErrorField(
  errors: Partial<Record<CheckoutBuyerField, string | { message?: string } | undefined>>,
): CheckoutBuyerField | null {
  return (
    FIELD_ORDER.find((field) => {
      const value = errors[field]
      if (!value) return false
      if (typeof value === "string") return value.length > 0
      return Boolean(value.message)
    }) ?? null
  )
}

/** Scroll + focus the first invalid checkout field. Never leave the user on a toast alone. */
export function onValidationError(field?: CheckoutBuyerField | string | null) {
  if (typeof document === "undefined") return
  const mapped =
    field && field in CHECKOUT_BUYER_FIELD_IDS
      ? CHECKOUT_BUYER_FIELD_IDS[field as CheckoutBuyerField]
      : null
  const id = mapped ?? "checkout-buyer"
  const node = document.getElementById(id)
  node?.scrollIntoView({ behavior: "smooth", block: "center" })
  if (node instanceof HTMLElement) {
    window.setTimeout(() => {
      node.focus({ preventScroll: true })
    }, 280)
  }
}
