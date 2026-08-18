import type { Page } from "@playwright/test"

export function e2eBuyerConfigured(): boolean {
  return Boolean(
    process.env.E2E_EVENT_ID &&
      process.env.E2E_BUYER_EMAIL &&
      process.env.E2E_BUYER_PASSWORD,
  )
}

export function e2eOrganizerConfigured(): boolean {
  return Boolean(
    process.env.E2E_ORGANIZER_EMAIL && process.env.E2E_ORGANIZER_PASSWORD,
  )
}

export async function loginBuyer(page: Page): Promise<void> {
  const email = process.env.E2E_BUYER_EMAIL ?? ""
  await page.goto("/login")
  await page.locator("#login-email").fill(email)
  await page.getByRole("button", { name: /enviar enlace/i }).click()
  await page.getByRole("status").waitFor({ timeout: 20_000 })
}

export async function loginOrganizer(page: Page): Promise<void> {
  const email = process.env.E2E_ORGANIZER_EMAIL ?? ""
  const password = process.env.E2E_ORGANIZER_PASSWORD ?? ""
  await page.goto("/login-organizador")
  await page.locator("#organizer-email").fill(email)
  await page.locator("#organizer-password").fill(password)
  await page.getByRole("button", { name: /Entrar a Tu Panel/i }).click()
  await page.waitForURL(/\/admin/, { timeout: 25_000 })
}

export const QA_BUYER = {
  name: "Ana Perez QA",
  dni: "32123456",
  email: "ana.qa@tokepass.test",
  phone: "1122334455",
}
