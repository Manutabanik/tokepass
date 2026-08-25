import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildInventorySummaryRows,
  inventorySummaryTotals,
  sectorCapacity,
} from "@/lib/events/inventory-summary-v2"

describe("sectorCapacity", () => {
  it("counts non-blocked seats and falls back to rows x seatsPerRow", () => {
    assert.equal(
      sectorCapacity({
        seats: [
          { status: "available" },
          { status: "reserved" },
          { status: "blocked" },
        ],
      }),
      2,
    )
    assert.equal(sectorCapacity({ rows: 3, seatsPerRow: 4, seats: [] }), 12)
  })
})

describe("buildInventorySummaryRows", () => {
  it("merges generals, extras and map sectors without duplicating map tickets", () => {
    const rows = buildInventorySummaryRows({
      tickets: [
        {
          name: "General",
          price: 10000,
          stock: 80,
          source: "general",
          startDate: "2026-08-01T10:00",
        },
        {
          name: "Platea",
          price: 18000,
          stock: 24,
          source: "map",
          sectorId: "sector-platea",
        },
      ],
      extras: [{ name: "Cerveza", price: 4000, stock: 50 }],
      sectors: [
        {
          id: "sector-platea",
          name: "Platea",
          price: 18000,
          seats: [{ status: "available" }, { status: "available" }],
        },
      ],
    })

    assert.equal(rows.length, 3)
    assert.equal(rows[0]?.type, "general")
    assert.equal(rows[0]?.hasPresale, true)
    assert.equal(rows[0]?.source.field, "tickets")
    assert.equal(rows[1]?.type, "mapa")
    assert.equal(rows[1]?.stock, 2)
    assert.equal(rows[1]?.stockReadOnly, true)
    assert.equal(rows[1]?.hasPresale, false)
    assert.equal(rows[1]?.source.field, "seatingMap.sectors")
    if (rows[1]?.source.field === "seatingMap.sectors") {
      assert.equal(rows[1].source.ticketIndex, 1)
    }
    assert.equal(rows[2]?.type, "extra")
    assert.equal(rows[2]?.name, "Cerveza")
  })

  it("keeps map tickets that are not backed by a sector", () => {
    const rows = buildInventorySummaryRows({
      tickets: [
        {
          name: "Box",
          price: 50000,
          stock: 4,
          source: "map",
          sectorId: "box-1",
        },
      ],
      extras: [],
      sectors: [],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.type, "mapa")
    assert.equal(rows[0]?.source.field, "tickets")
    assert.equal(rows[0]?.stockReadOnly, true)
  })
})

describe("inventorySummaryTotals", () => {
  it("sums stock and projected revenue", () => {
    const totals = inventorySummaryTotals(
      buildInventorySummaryRows({
        tickets: [{ name: "General", price: 10000, stock: 2 }],
        extras: [{ name: "Cerveza", price: 4000, stock: 3 }],
        sectors: [
          {
            id: "a",
            name: "Platea",
            price: 18000,
            seats: [{ status: "available" }],
          },
        ],
      }),
    )
    assert.equal(totals.stock, 6)
    assert.equal(totals.revenue, 10000 * 2 + 4000 * 3 + 18000)
  })
})
