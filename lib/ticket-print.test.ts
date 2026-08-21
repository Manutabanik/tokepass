import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ticketBackupCode,
  ticketOrderIdShort,
  ticketPrintCode,
} from "@/lib/ticket-print"

describe("ticketBackupCode", () => {
  it("strips UUID dashes and uppercases a short alphanumeric code", () => {
    assert.equal(
      ticketBackupCode("9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"),
      "9DFCC6CA8D97",
    )
  })

  it("prints an 8-character door code with hash", () => {
    assert.equal(
      ticketPrintCode("67f354ee-8d97-4d9c-951d-ffabc21e6210"),
      "#67F354EE",
    )
    assert.equal(ticketOrderIdShort("abcd1234-ffff-4000-8000-000000000001"), "ABCD1234")
  })
})
