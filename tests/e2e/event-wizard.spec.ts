import { expect, test } from "@playwright/test"

import { e2eOrganizerConfigured, loginOrganizer } from "./helpers/auth"

test.describe("Editor V2 — creación", () => {
  test("Crear evento abre el Editor V2", async ({ page }) => {
    test.skip(
      !e2eOrganizerConfigured(),
      "Definí E2E_ORGANIZER_EMAIL y E2E_ORGANIZER_PASSWORD en staging.",
    )

    await loginOrganizer(page)
    await page.goto("/admin/events/create")

    await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}\/edit\/?$/i)
    await expect(
      page.getByRole("navigation", { name: /Pasos del editor/i }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^Información$/i })).toBeVisible()
  })
})
