import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isAmbiguousTicketRelationshipError,
  isMissingTicketWalletColumnError,
  ticketsTierSelect,
  walletFriendlyLoadError,
} from "./wallet-query"

describe("ticketsTierSelect", () => {
  it("pins the ticket category FK, not the combo source", () => {
    assert.equal(
      ticketsTierSelect("name, price"),
      "ticket_tiers!tickets_tier_id_fkey(name, price)",
    )
  })
})

describe("isAmbiguousTicketRelationshipError", () => {
  it("matches PostgREST embed ambiguity", () => {
    assert.equal(
      isAmbiguousTicketRelationshipError(
        "Could not embed because more than one relationship was found for 'tickets' and 'ticket_tiers'",
      ),
      true,
    )
    assert.equal(isAmbiguousTicketRelationshipError("PGRST201"), true)
    assert.equal(isAmbiguousTicketRelationshipError("JWT expired"), false)
  })
})

describe("isMissingTicketWalletColumnError", () => {
  it("retries known schema-cache and missing-column errors", () => {
    assert.equal(
      isMissingTicketWalletColumnError(
        "Could not find the 'access_link' column of 'events' in the schema cache",
      ),
      true,
    )
    assert.equal(isMissingTicketWalletColumnError("PGRST204"), true)
    assert.equal(
      isMissingTicketWalletColumnError(
        "column events.delivery_mode does not exist",
      ),
      true,
    )
    assert.equal(isMissingTicketWalletColumnError("42703"), true)
    assert.equal(
      isMissingTicketWalletColumnError(
        "Could not find the 'ticket_type' column of 'ticket_tiers' in the schema cache",
      ),
      true,
    )
  })

  it("does not swallow unrelated query failures", () => {
    assert.equal(isMissingTicketWalletColumnError("JWT expired"), false)
    assert.equal(isMissingTicketWalletColumnError(""), false)
    assert.equal(isMissingTicketWalletColumnError(null), false)
  })
})

describe("walletFriendlyLoadError", () => {
  it("never returns raw PostgREST text", () => {
    assert.equal(
      walletFriendlyLoadError(
        new Error(
          "Could not embed because more than one relationship was found for 'tickets' and 'ticket_tiers'",
        ),
      ),
      null,
    )
    assert.equal(walletFriendlyLoadError(new Error("auth_required")), "auth_required")
    assert.equal(
      walletFriendlyLoadError(new Error("Sesión iniciada en otro dispositivo")),
      "wallet_device_mismatch",
    )
    assert.equal(walletFriendlyLoadError(new Error("boom")), null)
  })
})
