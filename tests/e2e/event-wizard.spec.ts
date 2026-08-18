import { expect, test } from "@playwright/test"

import { e2eOrganizerConfigured, loginOrganizer } from "./helpers/auth"

const PERSIST_KEY = "tokepass.event-form.v1"
const DRAFT_TITLE = "Festival QA Persistencia Wizard"

test.describe("Wizard de creación — 4 pasos y localStorage", () => {
  test("el contrato de persistencia sobrevive un reload en origen público", async ({
    page,
  }) => {
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
                  flyerName: null,
                  visibility: "public",
                  isMultiDay: false,
                  scheduleDays: [],
                  categoryId: "",
                  ageRestriction: "",
                },
                venue: {
                  mode: "new",
                  zoneType: "general_admission",
                  venueName: "",
                  saveVenueForReuse: true,
                },
                tickets: [],
              },
              venuePricingMap: {},
              zoneTierPricing: [],
              wizardStep: 1,
              updatedAt: Date.now(),
            },
            version: 2,
          }),
        )
      },
      [PERSIST_KEY, DRAFT_TITLE] as const,
    )

    await page.reload()
    const raw = await page.evaluate((key) => localStorage.getItem(key), PERSIST_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as {
      state: { values: { basics: { title: string } }; wizardStep: number }
    }
    expect(parsed.state.values.basics.title).toBe(DRAFT_TITLE)
    expect(parsed.state.wizardStep).toBe(1)
  })

  test("el stepper progresivo persiste título y pestaña al recargar /admin/events/create", async ({
    page,
  }) => {
    test.skip(
      !e2eOrganizerConfigured(),
      "Definí E2E_ORGANIZER_EMAIL y E2E_ORGANIZER_PASSWORD en staging.",
    )

    await loginOrganizer(page)
    await page.goto("/admin/events/create")

    await expect(page.getByRole("tab", { name: /Identidad/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Mapa y Sectores/i })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole("tab", { name: /Cronograma \/ Artistas/i }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("tab", { name: /Entradas y combos/i }),
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Configuración Final/i }),
    ).toBeVisible()

    await page.getByRole("tab", { name: /Identidad/i }).click()
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
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), PERSIST_KEY))
      .toContain(DRAFT_TITLE)

    await page.reload()
    await expect(page.locator("#event-title")).toHaveValue(DRAFT_TITLE)

    const stored = await page.evaluate((key) => localStorage.getItem(key), PERSIST_KEY)
    expect(stored).toContain(DRAFT_TITLE)
  })
})
