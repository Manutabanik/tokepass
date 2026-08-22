import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isPublicTicketActive,
  publicEventTickets,
  ticketUsesMapSelector,
  toPublicTicketSelectorTier,
} from "./public-ticket-view"

const gaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const mapId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

describe("public ticket view", () => {
  it("treats missing status as active and rejects inactive rows", () => {
    assert.equal(isPublicTicketActive({ visibility: "public" }), true)
    assert.equal(
      isPublicTicketActive({ visibility: "public", status: "ACTIVE" }),
      true,
    )
    assert.equal(
      isPublicTicketActive({ visibility: "public", status: "inactive" }),
      false,
    )
    assert.equal(isPublicTicketActive({ isActive: false }), false)
  })

  it("reads ticket_types when tiers is missing", () => {
    const tickets = publicEventTickets({
      ticket_types: [{ id: gaId }],
    })
    assert.equal(tickets.length, 1)
    assert.equal(tickets[0]?.id, gaId)
  })

  it("uses hasMap / isMapped before seating heuristics", () => {
    assert.equal(ticketUsesMapSelector({ hasMap: true }), true)
    assert.equal(ticketUsesMapSelector({ isMapped: true }), true)
    assert.equal(
      ticketUsesMapSelector({
        hasMap: false,
        seatingSectorId: "sector-1",
      }),
      false,
    )
    assert.equal(
      ticketUsesMapSelector({ seatingSectorId: "sector-1" }),
      true,
    )
  })

  it("maps hybrid flags and stock aliases onto the selector tier", () => {
    const mapped = toPublicTicketSelectorTier({
      id: mapId,
      name: "Platea",
      price: 18000,
      stock_available: 12,
      status: "ACTIVE",
      visibility: "public",
      seating_sector_id: "platea-a",
      layout_type: "numbered_seat",
      capacity: 40,
      sold: 28,
    })
    assert.equal(mapped.hasMap, true)
    assert.equal(mapped.isMapped, true)
    assert.equal(mapped.available, 12)
    assert.equal(mapped.isActive, true)
  })
})
