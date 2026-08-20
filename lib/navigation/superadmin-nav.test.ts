import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  SUPERADMIN_NAV,
  SUPERADMIN_NAV_GROUPS,
  isSuperAdminNavActive,
} from "@/components/shared/superadmin-nav"

describe("superadmin nav", () => {
  it("groups every existing panel link into four modules", () => {
    assert.deepEqual(
      SUPERADMIN_NAV_GROUPS.map((group) => group.id),
      ["control", "usuarios", "finanzas", "plataforma"],
    )
    assert.deepEqual(
      SUPERADMIN_NAV.map((item) => item.href),
      [
        "/superadmin",
        "/superadmin/applications",
        "/superadmin/events",
        "/superadmin/auditoria",
        "/superadmin/organizers",
        "/superadmin/buyers",
        "/superadmin/orders",
        "/superadmin/settlements",
        "/superadmin/soporte",
        "/superadmin/faq",
        "/superadmin/settings/sponsors",
        "/superadmin/categories",
        "/superadmin/settings",
      ],
    )
  })

  it("keeps dashboard exact and does not steal sponsors from settings", () => {
    assert.equal(isSuperAdminNavActive("/superadmin", "/superadmin"), true)
    assert.equal(
      isSuperAdminNavActive("/superadmin/events", "/superadmin"),
      false,
    )
    assert.equal(
      isSuperAdminNavActive(
        "/superadmin/settings/sponsors",
        "/superadmin/settings/sponsors",
      ),
      true,
    )
    assert.equal(
      isSuperAdminNavActive(
        "/superadmin/settings/sponsors",
        "/superadmin/settings",
      ),
      false,
    )
    assert.equal(
      isSuperAdminNavActive("/superadmin/settings", "/superadmin/settings"),
      true,
    )
  })
})
