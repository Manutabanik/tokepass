import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { selectOfflineScansReadyToFlush } from "@/lib/scanner/flush-offline-queue"

describe("offline scan flush filter", () => {
  it("drops pending transfers and cancelled tickets after resync", () => {
    const queue = [
      { ticket_id: "keep", event_id: "e1" },
      { ticket_id: "cesion", event_id: "e1" },
      { ticket_id: "reventa", event_id: "e1" },
      { ticket_id: "baja", event_id: "e1" },
      { ticket_id: "reembolso", event_id: "e1" },
      { ticket_id: "missing", event_id: "e1" },
    ]
    const ready = selectOfflineScansReadyToFlush(queue, [
      { id: "keep", status: "valid", pending_transfer: false },
      { id: "cesion", status: "valid", pending_transfer: true },
      { id: "reventa", status: "valid", listed_for_resale: true },
      { id: "baja", status: "cancelled", pending_transfer: false },
      { id: "reembolso", status: "refunded", pending_transfer: false },
    ])
    assert.deepEqual(
      ready.map((row) => row.ticket_id),
      ["keep"],
    )
  })
})
