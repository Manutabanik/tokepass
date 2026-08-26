import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertPublicEntityId,
  isPublicEntityId,
  isUuidV4,
} from "./public-ids"
import { generateGuestOrderToken, isGuestOrderToken } from "@/lib/checkout/guest-token"
import { ticketDisplayCode } from "@/lib/admin/issued-tickets"

describe("public entity ids", () => {
  it("accepts UUIDs and rejects integer surrogates", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000"
    assert.equal(isPublicEntityId(uuid), true)
    assert.equal(isUuidV4(uuid), true)
    assert.equal(isPublicEntityId("12345"), false)
    assert.equal(isPublicEntityId("TK-00001"), false)
    assert.equal(assertPublicEntityId(uuid), uuid)
    assert.throws(() => assertPublicEntityId("99", "ticket"))
  })

  it("keeps guest tokens and display codes off the primary key", () => {
    const token = generateGuestOrderToken()
    assert.equal(isGuestOrderToken(token), true)
    assert.equal(isPublicEntityId(token), false)
    assert.equal(
      ticketDisplayCode("550e8400-e29b-41d4-a716-446655440000"),
      "TK-550E8400",
    )
  })
})
