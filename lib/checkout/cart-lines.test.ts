import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cartLineAmount,
  cartLineBreakdownLabel,
  cartLineDisplayName,
  cartLineOfferTitle,
  cartLinePlaceBadge,
  cartLinePrimaryLabel,
  cartLineSnapshotLabel,
  cartLineSeatTitle,
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

describe("cartLineSeatTitle", () => {
  it("appends the stamped seat label to the ticket name", () => {
    assert.equal(
      cartLineSeatTitle({
        name: "Grada Naranja",
        seatLabel: "Mesa 04",
      }),
      "Grada Naranja - Mesa 04",
    )
  })
})

describe("cartLinePrimaryLabel", () => {
  it("hides qty and unit price when there is a single ticket", () => {
    assert.equal(
      cartLinePrimaryLabel({
        quantity: 1,
        name: "General Viernes",
        unitPriceLabel: "$10.000",
      }),
      "General Viernes",
    )
  })

  it("shows qty and unit price only when quantity is greater than 1", () => {
    assert.equal(
      cartLinePrimaryLabel({
        quantity: 2,
        name: "General Viernes",
        unitPriceLabel: "$10.000",
      }),
      "2x General Viernes — $10.000 c/u",
    )
  })
})

describe("cartLineOfferTitle", () => {
  it("joins the offer name and stamped day without qty or seat", () => {
    assert.equal(
      cartLineOfferTitle({
        name: "Entrada General",
        dateString: "Viernes 13 Nov",
      }),
      "Entrada General - Viernes 13 Nov",
    )
    assert.equal(
      cartLineOfferTitle({
        name: "Grada Amarilla",
        sectorName: "Grada Amarilla",
        dateLabel: "Sábado 14 Nov",
      }),
      "Grada Amarilla - Sábado 14 Nov",
    )
  })
})

describe("cartLinePlaceBadge", () => {
  it("prefers the stamped seat label", () => {
    assert.equal(
      cartLinePlaceBadge({ seatLabel: "Mesa 14", placeLabel: "Fila A" }),
      "Mesa 14",
    )
  })
})

describe("cartLineSnapshotLabel", () => {
  it("joins name, seat and stamped day without the active tab", () => {
    assert.equal(
      cartLineSnapshotLabel({
        name: "Entrada General",
        seatLabel: "Mesa 04",
        dateString: "Viernes 13 Nov",
      }),
      "Entrada General - Mesa 04 - Viernes 13 Nov",
    )
    assert.equal(
      cartLineSnapshotLabel({
        name: "Entrada General",
        dateString: "Sábado 14 Nov",
      }),
      "Entrada General - Sábado 14 Nov",
    )
  })
})

describe("cartLineBreakdownLabel", () => {
  it("renders quantity, sector, place and stamped day", () => {
    assert.equal(
      cartLineBreakdownLabel({
        quantity: 1,
        name: "Grada Amarilla",
        sectorName: "Grada Amarilla",
        placeLabel: "Fila A - Asiento 4",
        dateLabel: "Viernes 13 Nov",
      }),
      "1x Grada Amarilla - Fila A - Asiento 4 - Viernes 13 Nov",
    )
    assert.equal(
      cartLineBreakdownLabel({
        quantity: 1,
        name: "Grada Naranja",
        sectorName: "Grada Naranja",
        seatLabel: "Mesa 02",
        dateLabel: "Viernes 13 Nov",
      }),
      "1x Grada Naranja - Mesa 02 - Viernes 13 Nov",
    )
  })
})

describe("cartTicketLineId", () => {
  it("keeps date identity in the line id", () => {
    assert.equal(cartTicketLineId("tier-1", "d1"), "tier-1_d1")
    assert.equal(cartTicketLineId("tier-1"), "tier-1_all")
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
