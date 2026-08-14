import { toast } from "sonner"

export const CHECKOUT_PAYMENT_URL_MISSING =
  "No se pudo generar el link de pago. Intentá de nuevo en un momento."

/** Navega de inmediato a `init_point` / `sandbox_init_point` o a rutas internas (`/checkout/success`). */
export function redirectToCheckoutPayment(
  initPoint: string | null | undefined,
): boolean {
  const url = initPoint?.trim()
  if (!url) return false
  window.location.assign(url)
  return true
}

export function redirectToCheckoutPaymentOrToast(
  initPoint: string | null | undefined,
): boolean {
  if (redirectToCheckoutPayment(initPoint)) return true
  toast.error("No se pudo iniciar el pago", {
    description: CHECKOUT_PAYMENT_URL_MISSING,
  })
  return false
}
