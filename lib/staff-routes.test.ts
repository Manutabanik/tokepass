import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isPosOpsPath,
  navAllowedForStaffRoles,
  staffCanAccessPath,
  staffHomeForRoles,
} from "@/types/auth"

describe("staff route granularity", () => {
  it("limits door_staff to scanner and validator", () => {
    assert.equal(staffCanAccessPath("/admin/scanner", ["door_staff"]), true)
    assert.equal(
      staffCanAccessPath("/admin/scanner/live", ["door_staff"]),
      true,
    )
    assert.equal(staffCanAccessPath("/admin/validator", ["door_staff"]), true)
    assert.equal(staffCanAccessPath("/admin/pos", ["door_staff"]), false)
    assert.equal(staffCanAccessPath("/dashboard/pos", ["door_staff"]), false)
    assert.equal(staffCanAccessPath("/admin/finances", ["door_staff"]), false)
    assert.deepEqual(navAllowedForStaffRoles(["door_staff"]), [
      "/admin/scanner",
      "/admin/validator",
    ])
    assert.equal(staffHomeForRoles(["door_staff"]), "/admin/scanner")
  })

  it("limits POS routes to cashier roles", () => {
    assert.equal(isPosOpsPath("/admin/pos"), true)
    assert.equal(isPosOpsPath("/dashboard/pos/z/abc"), true)
    assert.equal(staffCanAccessPath("/admin/pos", ["cashier"]), true)
    assert.equal(
      staffCanAccessPath("/dashboard/pos", ["box_office_cashier"]),
      true,
    )
    assert.equal(staffCanAccessPath("/admin/scanner", ["cashier"]), false)
  })
})
