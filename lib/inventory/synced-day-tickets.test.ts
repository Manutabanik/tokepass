import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createInventoryTicket } from "./create-inventory-ticket"
import {
  applyFamilyBasePrice,
  familyHasDifferentiatedPrices,
  isBlankInventoryTicket,
  listInventoryFamilies,
  ticketSoldCount,
  upsertSyncedDayTickets,
} from "./synced-day-tickets"

describe("synced day tickets", () => {
  it("treats the wizard placeholder as blank", () => {
    assert.equal(isBlankInventoryTicket(createInventoryTicket("general")), true)
  })

  it("creates one ticket per day with the same base price", () => {
    const { tickets: next } = upsertSyncedDayTickets({
      tickets: [createInventoryTicket("general")],
      dayIds: ["day-a", "day-b"],
      isMultiDay: true,
      indexes: [],
      name: "General",
      capacity: 80,
      basePrice: 15000,
      differentiate: false,
      kind: "general",
    })
    const family = listInventoryFamilies(next)
    assert.equal(family.length, 1)
    assert.equal(family[0]?.indexes.length, 2)
    assert.equal(next[0]?.price, 15000)
    assert.equal(next[1]?.price, 15000)
    assert.equal(next[0]?.dayId, "day-a")
    assert.equal(next[1]?.dayId, "day-b")
    assert.equal(familyHasDifferentiatedPrices(next, family[0]!.indexes), false)
  })

  it("writes per-day prices only when differentiate is on", () => {
    const { tickets: created } = upsertSyncedDayTickets({
      tickets: [],
      dayIds: ["day-a", "day-b"],
      isMultiDay: true,
      indexes: [],
      name: "VIP",
      capacity: 40,
      basePrice: 20000,
      differentiate: true,
      dayPrices: { "day-a": 20000, "day-b": 25000 },
      kind: "general",
    })
    const family = listInventoryFamilies(created)[0]
    assert.ok(family)
    assert.equal(familyHasDifferentiatedPrices(created, family.indexes), true)
    const synced = applyFamilyBasePrice(created, family.indexes, 20000)
    assert.equal(familyHasDifferentiatedPrices(synced, family.indexes), false)
    assert.equal(synced[1]?.price, 20000)
  })

  it("sums sold across family rows", () => {
    const { tickets } = upsertSyncedDayTickets({
      tickets: [],
      dayIds: ["day-a", "day-b"],
      isMultiDay: true,
      indexes: [],
      name: "General",
      capacity: 80,
      basePrice: 15000,
      differentiate: false,
      kind: "general",
    })
    tickets[0] = { ...tickets[0]!, sold: 3 }
    tickets[1] = { ...tickets[1]!, sold: 2 }
    const family = listInventoryFamilies(tickets)[0]
    assert.equal(ticketSoldCount(tickets[0]), 3)
    assert.equal(family?.sold, 5)
  })

  it("keeps unnamed general tickets that already have stock", () => {
    const ticket = createInventoryTicket("general")
    ticket.capacity = 40
    const family = listInventoryFamilies([ticket])[0]
    assert.ok(family)
    assert.equal(family.stock, 40)
    assert.equal(family.name, "Entrada")
  })
})
