import { expect, test } from "@playwright/test"

import { e2eBuyerConfigured, loginBuyer, QA_BUYER } from "./helpers/auth"
import { blockMercadoPago } from "./helpers/mp-guard"
import {
  expectedPricePattern,
  SECTOR_AZUL_NAME,
  SECTOR_AZUL_UNIT_PRICE,
} from "./fixtures/zone-tier-pricing"

test.describe("Checkout evento masivo — sillas numeradas", () => {
  test.beforeEach(async ({ page }) => {
    await blockMercadoPago(page)
  })

  test("demo: Sector Azul, silla libre y precio de matriz", async ({
    page,
  }) => {
    await page.goto("/demo/seat-selection")
    await expect(
      page.getByRole("heading", { name: /Selección|Demo/i }),
    ).toBeVisible()

    await page.getByRole("button", { name: SECTOR_AZUL_NAME }).click()

    const availableSeat = page.getByRole("button", {
      name: /^Asiento 1$/,
    })
    await expect(availableSeat).toBeEnabled()
    await availableSeat.click()
    await expect(availableSeat).toHaveAttribute("aria-pressed", "true")

    const priceRe = expectedPricePattern(SECTOR_AZUL_UNIT_PRICE)
    await expect(page.getByText(priceRe).first()).toBeVisible()

    await page.getByRole("button", { name: /Continuar al pago/i }).click()
    await expect(page.getByText(/Selección lista/i)).toBeVisible()
    await expect(page.getByText(priceRe).first()).toBeVisible()
  })

  test("staging: evento publicado, asistentes y precio zone_tier_pricing", async ({
    page,
  }) => {
    test.skip(
      !e2eBuyerConfigured(),
      "Definí E2E_EVENT_ID, E2E_BUYER_EMAIL y E2E_BUYER_PASSWORD en staging.",
    )

    const eventId = process.env.E2E_EVENT_ID!
    await loginBuyer(page)
    await page.goto(`/events/${eventId}`)

    const buyCta = page.getByRole("button", { name: /Comprar Entradas/i })
    if ((await buyCta.count()) > 0) {
      await buyCta.first().click()
    }

    await page.locator("#buyer-name").fill(QA_BUYER.name)
    await page.locator("#buyer-dni").fill(QA_BUYER.dni)
    await page.locator("#buyer-phone").fill(QA_BUYER.phone)
    await page.locator("#buyer-email").fill(QA_BUYER.email)

    const numberedTab = page.getByRole("tab", {
      name: /Sillas Numeradas|Sector Azul|asiento/i,
    })
    if (await numberedTab.count()) {
      await numberedTab.click()
    }

    await page
      .getByRole("button", { name: /Elegir asiento|Elegir mesa/i })
      .first()
      .click()

    const azul = page.getByRole("button", { name: /Azul/i })
    await expect(azul.first()).toBeVisible()
    await azul.first().click()

    const seat = page.getByRole("button", { name: /^Asiento / }).filter({
      hasNotText: /no disponible/i,
    })
    await expect(seat.first()).toBeEnabled()
    await seat.first().click()

    const priceRe = expectedPricePattern()
    await expect(page.getByText(priceRe).first()).toBeVisible()

    await page.getByRole("button", { name: /Continuar al pago/i }).click()

    const sandbox = page.getByRole("button", {
      name: /Compra de prueba/i,
    })
    if (await sandbox.count()) {
      await sandbox.first().click()
      await expect(page).toHaveURL(/checkout\/success|sandbox=1/)
      return
    }

    const pay = page.getByRole("button", { name: /^Pagar /i })
    if (await pay.count()) {
      await pay.first().click()
    }

    await expect(page).not.toHaveURL(/mercadopago/i)
  })
})
