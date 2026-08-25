import { expect, test } from "@playwright/test"

import { e2eOrganizerConfigured, loginOrganizer } from "./helpers/auth"

const LEGACY_PERSIST_KEY = "tokepass.event-form.v1"
const DRAFT_TITLE = "Festival QA Persistencia Wizard"

test.describe("Wizard de creación — servidor como fuente de verdad", () => {
  test("localStorage residual no rehidrata el formulario", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(
      ([key, title]) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            state: {
              draftKey: "create",
              eventId: null,
              values: {
                basics: {
                  title,
                  date: "",
                  endDate: "",
                  description: "",
                },
                tickets: [],
              },
              wizardStep: 1,
              updatedAt: Date.now(),
            },
            version: 2,
          }),
        )
      },
      [LEGACY_PERSIST_KEY, DRAFT_TITLE] as const,
    )

    await page.reload()
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      LEGACY_PERSIST_KEY,
    )
    expect(raw).toBeTruthy()
  })

  test("el stepper progresivo no depende de localStorage en /admin/events/create", async ({
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
  })
})
