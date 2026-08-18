import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { organizerLeadSchema } from "./organizer-lead"

describe("organizerLeadSchema", () => {
  it("accepts a complete Argentine lead", () => {
    const parsed = organizerLeadSchema.parse({
      fullName: "Ana Perez",
      email: "ana@productora.com",
      phone: "11 2345 6789",
      eventName: "Noche en Club Central",
      estimatedAttendance: 800,
    })
    assert.equal(parsed.email, "ana@productora.com")
    assert.equal(parsed.phone, "+5491123456789")
    assert.equal(parsed.estimatedAttendance, 800)
  })

  it("rejects missing event name and invalid email", () => {
    const result = organizerLeadSchema.safeParse({
      fullName: "Ana",
      email: "no-email",
      phone: "1123456789",
      eventName: "",
      estimatedAttendance: 10,
    })
    assert.equal(result.success, false)
  })
})
