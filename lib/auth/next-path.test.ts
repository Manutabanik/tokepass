import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  authenticatedVisitorDestination,
  isAuthEntryRoute,
  isDeviceWalletFallbackPath,
  loginUrlWithNext,
  organizerLoginUrlWithNext,
  resolveAuthCallbackDestination,
  safeInternalNextPath,
} from "@/lib/auth/next-path"

describe("auth next path", () => {
  it("rejects open redirects", () => {
    assert.equal(safeInternalNextPath("https://evil.test"), null)
    assert.equal(safeInternalNextPath("//evil.test"), null)
    assert.equal(safeInternalNextPath("/checkout"), "/checkout")
  })

  it("honors checkout next and falls back to home for buyers", () => {
    assert.equal(
      resolveAuthCallbackDestination("/event/abc/checkout", "customer"),
      "/event/abc/checkout",
    )
    assert.equal(resolveAuthCallbackDestination(null, "customer"), "/")
    assert.equal(resolveAuthCallbackDestination(null, "admin"), "/admin")
  })

  it("sends the email wallet deep link through login without losing next", () => {
    assert.equal(
      loginUrlWithNext("/cuenta/entradas"),
      "/login?next=%2Fcuenta%2Fentradas",
    )
    assert.equal(
      resolveAuthCallbackDestination("/cuenta/entradas", "customer"),
      "/cuenta/entradas",
    )
  })

  it("keeps the organizer intent, query string included", () => {
    assert.equal(
      organizerLoginUrlWithNext("/dashboard/settings/bank"),
      "/login-organizador?next=%2Fdashboard%2Fsettings%2Fbank",
    )
    assert.equal(
      organizerLoginUrlWithNext("/admin/events/abc/tiers?tab=mesas"),
      "/login-organizador?next=%2Fadmin%2Fevents%2Fabc%2Ftiers%3Ftab%3Dmesas",
    )
  })

  it("falls back to the organizer panel instead of leaking an external next", () => {
    assert.equal(
      organizerLoginUrlWithNext("https://evil.test/admin"),
      "/login-organizador?next=%2Fadmin",
    )
    assert.equal(
      organizerLoginUrlWithNext("//evil.test"),
      "/login-organizador?next=%2Fadmin",
    )
  })

  it("treats only the login screens as auth entry routes", () => {
    assert.equal(isAuthEntryRoute("/login"), true)
    assert.equal(isAuthEntryRoute("/login-organizador"), true)
    assert.equal(isAuthEntryRoute("/register"), true)
    assert.equal(isAuthEntryRoute("/cuenta"), false)
  })

  it("leaves /register-organizador reachable so the signup funnel survives", () => {
    // Un cliente logueado postula su productora ahí, y el layout de admin manda
    // a los suspendidos a esa misma ruta: bloquearla haría un bucle.
    assert.equal(isAuthEntryRoute("/register-organizador"), false)
  })

  it("sends an already logged in visitor to their panel by role", () => {
    assert.equal(authenticatedVisitorDestination(null, "customer"), "/cuenta")
    assert.equal(authenticatedVisitorDestination(null, "admin"), "/admin")
    assert.equal(
      authenticatedVisitorDestination(null, "super_admin"),
      "/superadmin",
    )
  })

  it("honors next but never bounces back into a login screen", () => {
    assert.equal(
      authenticatedVisitorDestination("/cuenta/compras", "customer"),
      "/cuenta/compras",
    )
    assert.equal(authenticatedVisitorDestination("/login", "customer"), "/cuenta")
    assert.equal(
      authenticatedVisitorDestination("/login?next=/login", "customer"),
      "/cuenta",
    )
    assert.equal(
      authenticatedVisitorDestination("/login-organizador", "admin"),
      "/admin",
    )
  })

  it("ignores an external next instead of redirecting off-site", () => {
    assert.equal(
      authenticatedVisitorDestination("https://evil.test", "customer"),
      "/cuenta",
    )
    assert.equal(
      authenticatedVisitorDestination("//evil.test", "customer"),
      "/cuenta",
    )
  })
})

describe("device wallet fallback path", () => {
  it("catches the wallet root so a dead session does not hide the pass", () => {
    assert.equal(isDeviceWalletFallbackPath("/cuenta/entradas"), true)
    assert.equal(isDeviceWalletFallbackPath("/cuenta/entradas/"), true)
  })

  it("leaves the guest token routes alone", () => {
    // Ambas resuelven el caso sin sesión con su propio acceso por token.
    assert.equal(isDeviceWalletFallbackPath("/cuenta/entradas/acceso"), false)
    assert.equal(
      isDeviceWalletFallbackPath("/cuenta/entradas/8f0c1d2e-ticket"),
      false,
    )
  })

  it("does not catch the rest of the account portal", () => {
    assert.equal(isDeviceWalletFallbackPath("/cuenta"), false)
    assert.equal(isDeviceWalletFallbackPath("/cuenta/compras"), false)
    assert.equal(isDeviceWalletFallbackPath("/cuenta/perfil"), false)
  })

  it("does not catch lookalike paths from another prefix", () => {
    assert.equal(isDeviceWalletFallbackPath("/admin/cuenta/entradas"), false)
    assert.equal(isDeviceWalletFallbackPath("/cuenta/entradas-extra"), false)
  })
})
