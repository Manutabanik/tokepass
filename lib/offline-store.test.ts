import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MyStoreRedemption } from "@/app/actions/addons"

import {
  isOfflineRedemptionExpired,
  isOfflineTicketExpired,
  keepRedemptionOffline,
  OFFLINE_TICKET_TTL_GRACE_MS,
  resolveOfflineTicketEndsAt,
  sanitizeRedemptionForOffline,
} from "./offline-store"

function redemption(
  overrides: Partial<MyStoreRedemption> = {},
): MyStoreRedemption {
  return {
    id: "red-1",
    qrCodeToken: "bar_secret_token",
    status: "valid",
    redeemedAt: null,
    itemId: "item-1",
    itemName: "Cerveza",
    itemDescription: null,
    itemPrice: 3500,
    itemImageUrl: null,
    itemCategory: "drinks",
    orderId: "order-1",
    isTest: false,
    eventId: "event-1",
    eventTitle: "Fiesta",
    eventDate: "2026-08-20T22:00:00.000Z",
    eventLocation: "Club",
    ...overrides,
  }
}

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

describe("offline redemption cache policy", () => {
  it("expires from eventDate plus the same 24h grace", () => {
    const eventDate = "2026-08-20T22:00:00.000Z"
    const eventMs = new Date(eventDate).getTime()

    assert.equal(isOfflineRedemptionExpired({ eventDate }, eventMs), false)
    assert.equal(
      isOfflineRedemptionExpired(
        { eventDate },
        eventMs + OFFLINE_TICKET_TTL_GRACE_MS + 1,
      ),
      true,
    )
  })

  it("keeps a redemption without a usable event date", () => {
    assert.equal(isOfflineRedemptionExpired({ eventDate: null }), false)
    assert.equal(isOfflineRedemptionExpired({ eventDate: "sin-fecha" }), false)
  })

  it("keeps the token only while the redemption is still valid", () => {
    assert.equal(
      sanitizeRedemptionForOffline(redemption()).qrCodeToken,
      "bar_secret_token",
    )
  })

  it("drops the token of an already consumed redemption", () => {
    const consumed = sanitizeRedemptionForOffline(
      redemption({ status: "redeemed", redeemedAt: "2026-08-20T23:30:00.000Z" }),
    )

    assert.equal(consumed.qrCodeToken, "")
    assert.equal(consumed.redeemedAt, "2026-08-20T23:30:00.000Z")
  })

  it("caches valid and redeemed rows but not cancelled or pending ones", () => {
    const eventMs = new Date("2026-08-20T22:00:00.000Z").getTime()

    assert.equal(keepRedemptionOffline(redemption(), eventMs), true)
    assert.equal(
      keepRedemptionOffline(redemption({ status: "redeemed" }), eventMs),
      true,
    )
    assert.equal(
      keepRedemptionOffline(redemption({ status: "cancelled" }), eventMs),
      false,
    )
    assert.equal(
      keepRedemptionOffline(redemption({ status: "pending" }), eventMs),
      false,
    )
  })

  it("stops caching once the event grace window closed", () => {
    const eventMs = new Date("2026-08-20T22:00:00.000Z").getTime()

    assert.equal(
      keepRedemptionOffline(
        redemption(),
        eventMs + OFFLINE_TICKET_TTL_GRACE_MS + 1,
      ),
      false,
    )
  })
})
