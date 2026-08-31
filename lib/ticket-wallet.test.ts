import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  groupWalletTicketsByEventOrders,
  ticketAdmissionTitle,
  ticketExactSeatLabel,
  ticketOrdinalInGroup,
  ticketOrdinalLabel,
  walletOrderKey,
  walletPurchaseHeading,
} from "@/lib/ticket-wallet"

describe("ticket wallet ordinals", () => {
  it("labels several tickets of the same tier", () => {
    assert.equal(ticketOrdinalLabel("General", 0, 4), "General - Entrada 1 de 4")
    assert.equal(ticketOrdinalLabel("General", 3, 4), "General - Entrada 4 de 4")
  })

  it("keeps a single ticket without the N de M suffix", () => {
    assert.equal(ticketOrdinalLabel("VIP", 0, 1), "VIP")
  })

  it("prefers the exact seat over the ordinal", () => {
    assert.equal(
      ticketOrdinalLabel("GRADA NARANJA", 0, 32, "Mesa 05"),
      "GRADA NARANJA - Mesa 05",
    )
  })

  it("numbers within the same tier of an event group", () => {
    const tickets = [
      { id: "a", tierName: "General" },
      { id: "b", tierName: "VIP" },
      { id: "c", tierName: "General" },
    ]
    assert.equal(
      ticketOrdinalInGroup(tickets, tickets[2]!).label,
      "General - Entrada 2 de 2",
    )
    assert.equal(ticketOrdinalInGroup(tickets, tickets[1]!).label, "VIP")
  })

  it("shows the map place instead of Entrada N de M", () => {
    const tickets = [
      {
        id: "a",
        tierName: "GRADA NARANJA",
        seatingLabel: "Mesa 01",
        seatingLayoutType: "table_combo" as const,
      },
      {
        id: "b",
        tierName: "GRADA NARANJA",
        seatingLabel: "Mesa 05",
        seatingLayoutType: "table_combo" as const,
      },
    ]
    assert.equal(
      ticketOrdinalInGroup(tickets, tickets[1]!).label,
      "GRADA NARANJA - Mesa 05",
    )
  })
})

describe("ticket exact seat label", () => {
  it("returns the table name from the map", () => {
    assert.equal(
      ticketExactSeatLabel({
        seatingLabel: "Mesa 01",
        seatingLayoutType: "table_combo",
        tierName: "GRADA NARANJA",
      }),
      "Mesa 01",
    )
  })

  it("composes row and seat for numbered places", () => {
    assert.equal(
      ticketExactSeatLabel({
        seatingLabel: "12",
        seatingRowLabel: "3",
        seatingLayoutType: "numbered_seat",
        tierName: "Platea",
      }),
      "Fila 3 - Asiento 12",
    )
  })

  it("ignores a label that only repeats the tier", () => {
    assert.equal(
      ticketExactSeatLabel({
        seatingLabel: "General",
        tierName: "General",
      }),
      null,
    )
  })

  it("builds the admission title from the seat", () => {
    assert.equal(
      ticketAdmissionTitle({
        tierName: "GRADA NARANJA",
        seatingLabel: "Mesa 05",
        seatingLayoutType: "table_combo",
      }),
      "GRADA NARANJA - Mesa 05",
    )
  })
})

describe("wallet order grouping", () => {
  const base = {
    eventId: "evt-1",
    eventTitle: "Fiesta Nacional",
    eventDate: "2026-09-12T22:00:00.000-03:00",
    eventLocation: "Predio",
    flyerUrl: null,
  }

  it("keeps two purchases of the same event in separate order buckets", () => {
    const groups = groupWalletTicketsByEventOrders([
      {
        ...base,
        id: "t1",
        orderId: "11111111-1111-4111-8111-111111111111",
        orderCreatedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-08-01T10:00:01.000Z",
      },
      {
        ...base,
        id: "t2",
        orderId: "11111111-1111-4111-8111-111111111111",
        orderCreatedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-08-01T10:00:02.000Z",
      },
      {
        ...base,
        id: "t3",
        orderId: "22222222-2222-4222-8222-222222222222",
        orderCreatedAt: "2026-08-20T18:00:00.000Z",
        createdAt: "2026-08-20T18:00:01.000Z",
      },
    ])

    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.tickets.length, 3)
    assert.equal(groups[0]?.orders.length, 2)
    assert.equal(groups[0]?.orders[0]?.tickets.length, 1)
    assert.equal(groups[0]?.orders[1]?.tickets.length, 2)
    assert.equal(
      groups[0]?.orders[0]?.orderId,
      "22222222-2222-4222-8222-222222222222",
    )
  })

  it("does not merge tickets that have no order id", () => {
    assert.equal(walletOrderKey({ id: "a", orderId: null }), "ticket:a")
    const groups = groupWalletTicketsByEventOrders([
      { ...base, id: "a", orderId: null, createdAt: "2026-08-01T10:00:00.000Z" },
      { ...base, id: "b", orderId: null, createdAt: "2026-08-02T10:00:00.000Z" },
    ])
    assert.equal(groups[0]?.orders.length, 2)
  })

  it("builds the purchase heading with date, order code and count", () => {
    assert.equal(
      walletPurchaseHeading({
        purchasedAtLabel: "1 de agosto",
        orderId: "abcd1234-ffff-4000-8000-000000000001",
        ticketCount: 4,
      }),
      "Compra del 1 de agosto · TP-ABCD1234 · 4 entradas",
    )
  })
})
