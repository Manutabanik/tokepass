import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getAdminNavItems,
  ORGANIZER_NAV,
} from "@/components/shared/admin-nav"

describe("admin organizer nav", () => {
  it("keeps the five operational sections without canvas, faqs or install", () => {
    const hrefs = ORGANIZER_NAV.map((item) => item.href)
    assert.equal(hrefs.includes("/admin"), true)
    assert.equal(hrefs.includes("/admin/events"), true)
    assert.equal(hrefs.includes("/admin/canvas-comercial"), false)
    assert.equal(hrefs.includes("/admin/support-faqs"), false)
    assert.equal(hrefs.includes("/superadmin/faq"), false)
    assert.equal(
      ORGANIZER_NAV.some((item) => /instalar|canvas|preguntas/i.test(item.label)),
      false,
    )
  })

  it("filters staff items by role", () => {
    const items = getAdminNavItems({
      mode: "staff",
      staffRoles: ["cashier"],
    })
    assert.deepEqual(
      items.map((item) => item.href),
      ["/dashboard/pos"],
    )
  })
})
