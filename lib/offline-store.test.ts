import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isOfflineTicketExpired,
  OFFLINE_TICKET_TTL_GRACE_MS,
  resolveOfflineTicketEndsAt,
} from "./offline-store"

describe("offline ticket expiry", () => {
  it("prefers ends_at over eventDate", () => {
    assert.equal(
      resolveOfflineTicketEndsAt({
        ends_at: "2026-08-21T06:00:00.000Z",
        eventDate: "2026-08-20T22:00:00.000Z",
      }),
      "2026-08-21T06:00:00.000Z",
    )
  })

  it("purges after the event end plus 24h grace", () => {
    const endsAt = "2026-08-21T06:00:00.000Z"
    const endMs = new Date(endsAt).getTime()
    assert.equal(
      isOfflineTicketExpired({ endsAt, eventDate: endsAt }, endMs),
      false,
    )
    assert.equal(
      isOfflineTicketExpired(
        { endsAt, eventDate: endsAt },
        endMs + OFFLINE_TICKET_TTL_GRACE_MS + 1,
      ),
      true,
    )
  })
})
