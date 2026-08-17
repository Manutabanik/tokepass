import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isAccountFocusedFlow,
  isAdminFocusedFlow,
  isPublicEventStorefrontPath,
  isPublicFocusedFlow,
} from "@/lib/navigation/focused-flows"

describe("focused-flows", () => {
  it("oculta chrome admin en wizard y escaner", () => {
    assert.equal(isAdminFocusedFlow("/admin/events/create"), true)
    assert.equal(isAdminFocusedFlow("/admin/events/abc/edit"), true)
    assert.equal(isAdminFocusedFlow("/admin/pos"), true)
    assert.equal(isAdminFocusedFlow("/dashboard/pos"), true)
    assert.equal(isAdminFocusedFlow("/admin/scanner"), true)
    assert.equal(isAdminFocusedFlow("/admin/validator"), true)
    assert.equal(isAdminFocusedFlow("/admin/events"), false)
    assert.equal(isAdminFocusedFlow("/admin"), false)
  })

  it("oculta chrome de cuenta en detalle de entrada o compra", () => {
    assert.equal(isAccountFocusedFlow("/cuenta/entradas/abc"), true)
    assert.equal(isAccountFocusedFlow("/cuenta/compras/xyz"), true)
    assert.equal(isAccountFocusedFlow("/cuenta/entradas"), false)
    assert.equal(isAccountFocusedFlow("/cuenta"), false)
  })

  it("oculta la bottom nav publica en checkout y detalle", () => {
    assert.equal(isPublicFocusedFlow("/checkout/success"), true)
    assert.equal(isPublicFocusedFlow("/event/fiesta/queue"), true)
    assert.equal(isPublicFocusedFlow("/waiting-room"), true)
    assert.equal(isPublicFocusedFlow("/tickets/abc/print"), true)
    assert.equal(isPublicFocusedFlow("/cuenta/entradas/abc"), true)
    assert.equal(isPublicFocusedFlow("/"), false)
    assert.equal(isPublicFocusedFlow("/events"), false)
  })

  it("detecta la ficha publica de un evento", () => {
    assert.equal(isPublicEventStorefrontPath("/eventos/fiesta-tradicion"), true)
    assert.equal(isPublicEventStorefrontPath("/events/abc"), true)
    assert.equal(isPublicEventStorefrontPath("/events/preview/abc"), true)
    assert.equal(isPublicEventStorefrontPath("/events"), false)
    assert.equal(isPublicEventStorefrontPath("/"), false)
  })
})
