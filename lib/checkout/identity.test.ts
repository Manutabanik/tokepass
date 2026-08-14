import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hasCheckoutIdentity,
  isCheckoutGuest,
  needsIdentityChoice,
} from "./identity"
import { publicEventLoginPath, publicEventPath } from "@/lib/seo/site"

describe("checkout identity gate", () => {
  it("lets guests and logged-in buyers skip the identity dialog", () => {
    assert.equal(hasCheckoutIdentity(null, "undecided"), false)
    assert.equal(hasCheckoutIdentity(null, "guest"), true)
    assert.equal(hasCheckoutIdentity("user-1", "undecided"), true)
    assert.equal(needsIdentityChoice(null, "undecided"), true)
    assert.equal(needsIdentityChoice(null, "guest"), false)
  })

  it("captures guest checkout so PII is asked only at pay", () => {
    assert.equal(isCheckoutGuest("guest", null), true)
    assert.equal(isCheckoutGuest("guest", null, true), true)
    assert.equal(isCheckoutGuest("undecided", null, true), true)
    assert.equal(isCheckoutGuest("guest", "user-1"), false)
    assert.equal(isCheckoutGuest("account", null), false)
    assert.equal(isCheckoutGuest("undecided", null), false)
  })

  it("builds login next from the public event slug, not /events/:id", () => {
    const path = publicEventLoginPath({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      slug: "pena-hacha-a1b2c3d4",
    })
    assert.equal(path, "/login?next=%2Feventos%2Fpena-hacha-a1b2c3d4")
    assert.equal(
      publicEventPath({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        slug: "pena-hacha-a1b2c3d4",
      }),
      "/eventos/pena-hacha-a1b2c3d4",
    )
    assert.ok(!path.includes("/events/"))
  })
})
