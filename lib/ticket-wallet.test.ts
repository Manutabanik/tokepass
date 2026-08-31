import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ticketAdmissionTitle,
  ticketExactSeatLabel,
  ticketOrdinalInGroup,
  ticketOrdinalLabel,
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
