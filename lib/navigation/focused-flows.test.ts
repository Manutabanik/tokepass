import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isAccountFocusedFlow,
  isAdminFocusedFlow,
} from "@/lib/navigation/focused-flows"

describe("focused-flows", () => {
  it("oculta chrome admin en wizard y escaner", () => {
    assert.equal(isAdminFocusedFlow("/admin/events/create"), true)
    assert.equal(isAdminFocusedFlow("/admin/events/abc/edit"), true)
    assert.equal(isAdminFocusedFlow("/admin/scanner"), true)
    assert.equal(isAdminFocusedFlow("/admin/events"), false)
    assert.equal(isAdminFocusedFlow("/admin"), false)
  })

  it("oculta chrome de cuenta en detalle de entrada o compra", () => {
    assert.equal(isAccountFocusedFlow("/cuenta/entradas/abc"), true)
    assert.equal(isAccountFocusedFlow("/cuenta/compras/xyz"), true)
    assert.equal(isAccountFocusedFlow("/cuenta/entradas"), false)
    assert.equal(isAccountFocusedFlow("/cuenta"), false)
  })
})
