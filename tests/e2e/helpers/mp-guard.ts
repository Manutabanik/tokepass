import type { Page } from "@playwright/test"

/** Hosts de Mercado Pago Checkout Pro (prod y sandbox). */
const MP_HOST_RE =
  /mercadopago\.com|mercadolibre\.com|mlstatic\.com|mercadopago\.com\.ar/i

/**
 * Bloquea cualquier navegación o XHR hacia la pasarela.
 * Los tests deben usar demo, sandbox TokePass o aserciones previas al redirect.
 */
export async function blockMercadoPago(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url()
    if (MP_HOST_RE.test(url)) {
      return route.fulfill({
        status: 418,
        contentType: "application/json",
        body: JSON.stringify({
          mocked: true,
          reason: "E2E: Mercado Pago bloqueado a propósito",
        }),
      })
    }
    return route.continue()
  })
}
