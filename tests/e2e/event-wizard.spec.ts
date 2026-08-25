import { expect, test } from "@playwright/test"

import { e2eOrganizerConfigured, loginOrganizer } from "./helpers/auth"

const DRAFT_TITLE = "Festival QA Wizard Sin LocalStorage"

test.describe("Wizard de creación — pasos progresivos", () => {
  test("el stepper progresivo mantiene el título en memoria durante la sesión", async ({
    page,
  }) => {
    test.skip(
      !e2eOrganizerConfigured(),
      "Definí E2E_ORGANIZER_EMAIL y E2E_ORGANIZER_PASSWORD en staging.",
    )

    await loginOrganizer(page)
    await page.goto("/admin/events/create")

    await expect(page.getByRole("tab", { name: /Datos principales/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Mapa y Sectores/i })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole("tab", { name: /Cronograma \/ Artistas/i }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("tab", { name: /Entradas y precios/i }),
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Publicar y cobrar/i }),
    ).toBeVisible()

    await page.getByRole("tab", { name: /Datos principales/i }).click()
    await page
      .getByRole("switch", {
        name: /habilitar cronograma \/ agenda del evento/i,
      })
      .click()
    await expect(
      page.getByRole("tab", { name: /Cronograma \/ Artistas/i }),
    ).toBeVisible()

    await page
      .getByRole("switch", {
        name: /mapa de ubicaciones o butacas numeradas/i,
      })
      .click()
    await expect(page.getByRole("tab", { name: /Mapa y Sectores/i })).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Zonas y Sectores/i }),
    ).toHaveCount(0)

    await page.locator("#event-title").fill(DRAFT_TITLE)
    await expect(page.locator("#event-title")).toHaveValue(DRAFT_TITLE)

    await page.getByRole("tab", { name: /Mapa y Sectores/i }).click()
    await expect(page.locator("#event-title")).toHaveValue(DRAFT_TITLE)
  })
})
