import { expect, test } from "@playwright/test"

import { e2eOrganizerConfigured, loginOrganizer } from "./helpers/auth"

const PERSIST_KEY = "tokepass.event-form.v1"
const DRAFT_TITLE = "Festival QA Persistencia Wizard"

test.describe("Wizard de creación — 5 pasos y localStorage", () => {
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
              wizardStep: 2,
              updatedAt: Date.now(),
            },
            version: 0,
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
    expect(parsed.state.wizardStep).toBe(2)
  })

  test("los 5 pasos persisten título y pestaña al recargar /admin/events/create", async ({
    page,
  }) => {
    test.skip(
      !e2eOrganizerConfigured(),
      "Definí E2E_ORGANIZER_EMAIL y E2E_ORGANIZER_PASSWORD en staging.",
    )

    await loginOrganizer(page)
    await page.goto("/admin/events/create")

    await expect(page.getByRole("tab", { name: /Identidad/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Lugar y Mapa/i })).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Zonas y Sectores/i }),
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Entradas y Combos/i }),
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Cobros y Publicación/i }),
    ).toBeVisible()

    await page.getByRole("tab", { name: /Identidad/i }).click()
    await page.locator("#event-title").fill(DRAFT_TITLE)
    await expect(page.locator("#event-title")).toHaveValue(DRAFT_TITLE)

    await page.getByRole("tab", { name: /Zonas y Sectores/i }).click()
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), PERSIST_KEY))
      .toContain(DRAFT_TITLE)

    await page.reload()
    await expect(page.locator("#event-title")).toHaveValue(DRAFT_TITLE)

    const stored = await page.evaluate((key) => localStorage.getItem(key), PERSIST_KEY)
    expect(stored).toContain(DRAFT_TITLE)
  })
})
