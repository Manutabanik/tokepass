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

function focusCheckoutNode(node: HTMLElement) {
  node.scrollIntoView({ behavior: "smooth", block: "center" })
  window.setTimeout(() => {
    node.focus({ preventScroll: true })
  }, 280)
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
  if (node instanceof HTMLElement) {
    focusCheckoutNode(node)
  }
}

/** Prefer the first marked invalid input; fall back to a known buyer field. */
export function scrollToFirstInvalidCheckoutField(
  field?: CheckoutBuyerField | string | null,
) {
  if (typeof document === "undefined") return
  const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (invalid) {
    focusCheckoutNode(invalid)
    return
  }
  onValidationError(field)
}
