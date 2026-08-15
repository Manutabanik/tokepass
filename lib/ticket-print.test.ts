import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ticketBackupCode } from "@/lib/ticket-print"

describe("ticketBackupCode", () => {
  it("strips UUID dashes and uppercases a short alphanumeric code", () => {
    assert.equal(
      ticketBackupCode("9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"),
      "9DFCC6CA8D97",
    )
  })
})
