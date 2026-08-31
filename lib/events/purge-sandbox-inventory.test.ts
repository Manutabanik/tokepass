import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sandboxOrderIdsFromTickets } from "./purge-sandbox-inventory"

describe("sandboxOrderIdsFromTickets", () => {
  it("collects unique order ids from test tickets", () => {
    assert.deepEqual(
      sandboxOrderIdsFromTickets([
        { order_id: "a" },
        { order_id: "a" },
        { order_id: "b" },
        { order_id: null },
        { order_id: "  " },
      ]),
      ["a", "b"],
    )
  })
})
