import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cartLineAmount,
  cartLineBreakdownLabel,
  cartLineDisplayName,
  cartLineUnitPrice,
  cartPlaceLabel,
  cartTicketLineId,
} from "./cart-lines"

describe("cartLineDisplayName", () => {
  it("appends the compact date in parentheses", () => {
    assert.equal(
      cartLineDisplayName({
        name: "Mesas - Tablon 02",
        dateLabel: "Jue 12 Nov",
      }),
      "Mesas - Tablon 02 (Jue 12 Nov)",
    )
  })

  it("prefers the printed displayName over the raw name", () => {
    assert.equal(
      cartLineDisplayName({
        name: "Mesa 4",
        displayName: "Mesa VIP Escenario 1",
      }),
      "Mesa VIP Escenario 1",
    )
  })

  it("leaves the name unchanged when there is no date", () => {
    assert.equal(
      cartLineDisplayName({ name: "General" }),
      "General",
    )
  })

  it("does not duplicate an existing date suffix", () => {
    assert.equal(
      cartLineDisplayName({
        name: "General (Vie 21 Ago)",
        dateLabel: "Vie 21 Ago",
      }),
      "General (Vie 21 Ago)",
    )
  })
})

describe("cartPlaceLabel", () => {
  it("formats numbered seats and tables", () => {
    assert.equal(
      cartPlaceLabel({ type: "seat", row: "A", number: 4 }),
      "Fila A - Asiento 4",
    )
    assert.equal(
      cartPlaceLabel({ type: "table", number: 2 }),
      "Mesa 02",
    )
  })
})

describe("cartLineBreakdownLabel", () => {
  it("renders quantity, sector, place and day", () => {
    assert.equal(
      cartLineBreakdownLabel({
        quantity: 1,
        name: "Grada Amarilla",
        sectorName: "Grada Amarilla",
        placeLabel: "Fila A - Asiento 4",
        dateLabel: "Viernes 13 Nov",
      }),
      "1x Grada Amarilla (Fila A - Asiento 4) - Viernes 13 Nov",
    )
    assert.equal(
      cartLineBreakdownLabel({
        quantity: 1,
        name: "Grada Naranja",
        sectorName: "Grada Naranja",
        placeLabel: "Mesa 02",
        dateLabel: "Viernes 13 Nov",
      }),
      "1x Grada Naranja (Mesa 02) - Viernes 13 Nov",
    )
  })
})

describe("cartTicketLineId", () => {
  it("keeps date identity in the line id", () => {
    assert.equal(cartTicketLineId("tier-1", "d1"), "ticket:tier-1__d1")
    assert.equal(cartTicketLineId("tier-1"), "ticket:tier-1__all")
  })
})

describe("cartLineUnitPrice", () => {
  it("keeps the stamped line price even if the catalog mixed another SKU", () => {
    assert.equal(
      cartLineUnitPrice({ price: 155969 }, { price: 673391 }),
      155969,
    )
    assert.equal(cartLineUnitPrice({ price: 0 }, { price: 673391 }), 0)
  })

  it("falls back to the catalog only when the line has no valid price", () => {
    assert.equal(
      cartLineUnitPrice({ price: Number.NaN }, { price: 155969 }),
      155969,
    )
  })
})

describe("cartLineAmount", () => {
  it("multiplies unit price by quantity", () => {
    assert.equal(cartLineAmount({ price: 15000, quantity: 3 }), 45000)
    assert.equal(cartLineAmount({ price: 15000, quantity: 0 }), 0)
  })

  it("keeps decimal money in integer cents", () => {
    assert.equal(cartLineAmount({ price: 10.1, quantity: 3 }), 30.3)
  })
})
