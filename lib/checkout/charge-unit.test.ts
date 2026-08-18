import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  displayChargePrice,
  formatChargeFormula,
  formatSelectionChargeDetail,
  resolveChargeUnit,
  storefrontLineSkuQuantity,
  storefrontLineTotal,
} from "./charge-unit"

describe("resolveChargeUnit", () => {
  it("marks table_combo per seat as per person", () => {
    const unit = resolveChargeUnit({
      layoutType: "table_combo",
      capacityPerUnit: 4,
      name: "Mesas VIP",
    })
    assert.equal(unit.unitType, "per_person")
    assert.equal(unit.badge, "por persona")
    assert.equal(unit.capacity, 4)
    assert.equal(unit.noun, "mesa")
  })

  it("marks group sale as a closed unit", () => {
    const unit = resolveChargeUnit({
      layoutType: "table_combo",
      capacityPerUnit: 6,
      sellMode: "group",
      priceMode: "closed_unit",
      name: "Palco Norte",
    })
    assert.equal(unit.unitType, "full_table")
    assert.equal(unit.badge, "INCLUYE 6 ACCESOS")
    assert.equal(unit.noun, "palco")
    assert.equal(unit.priceMode, "closed_unit")
  })

  it("keeps general admission without a unit badge", () => {
    const unit = resolveChargeUnit({
      layoutType: "general",
      capacityPerUnit: 1,
      name: "General",
    })
    assert.equal(unit.badge, null)
    assert.equal(unit.noun, "lugar")
  })
})

describe("formatChargeFormula", () => {
  it("shows closed-unit table math without multiplying chairs", () => {
    assert.equal(
      formatChargeFormula({
        units: 1,
        unitType: "full_table",
        capacity: 6,
        unitPrice: 58824,
        noun: "mesa",
        sellMode: "group",
        priceMode: "closed_unit",
      }),
      "1 Mesa (6 personas incluidas) = $ 58.824",
    )
  })

  it("shows the per-person table math", () => {
    assert.equal(
      formatChargeFormula({
        units: 1,
        unitType: "full_table",
        capacity: 6,
        unitPrice: 58824,
        noun: "mesa",
        sellMode: "per_seat",
        priceMode: "per_person",
      }),
      "6 lugares \u00d7 $ 58.824/persona = $ 352.944",
    )
  })

  it("shows people-only math", () => {
    assert.equal(
      formatChargeFormula({
        units: 2,
        unitType: "per_person",
        capacity: 4,
        unitPrice: 58824,
        noun: "mesa",
      }),
      "2 lugares \u00d7 $ 58.824/persona = $ 117.648",
    )
  })
})

describe("displayChargePrice", () => {
  it("keeps the listed per-person price on shared tables", () => {
    const unit = resolveChargeUnit({
      layoutType: "table_combo",
      capacityPerUnit: 4,
    })
    assert.equal(displayChargePrice(unit, 58824), 58824)
  })
})

describe("formatSelectionChargeDetail", () => {
  it("explains a closed reserved table in the cart", () => {
    assert.equal(
      formatSelectionChargeDetail({
        type: "table",
        name: "Mesas \u00b7 Mesa 17",
        capacity: 6,
        unitPrice: 58824,
        sellMode: "group",
        priceMode: "closed_unit",
      }),
      "1 Mesa (6 personas incluidas) = $ 58.824",
    )
  })

  it("explains a per-person reserved table in the cart", () => {
    assert.equal(
      formatSelectionChargeDetail({
        type: "table",
        name: "Mesas \u00b7 Mesa 17",
        capacity: 4,
        unitPrice: 58824,
        sellMode: "per_seat",
        priceMode: "per_person",
      }),
      "4 lugares \u00d7 $ 58.824/persona = $ 235.296",
    )
  })
})

describe("storefrontLineTotal", () => {
  it("charges the closed table price once", () => {
    assert.equal(
      storefrontLineTotal({
        price: 58824,
        capacity: 6,
        sellMode: "group",
        priceMode: "closed_unit",
      }),
      58824,
    )
  })

  it("multiplies per-person tables by chairs", () => {
    assert.equal(
      storefrontLineTotal({
        price: 58824,
        capacity: 6,
        sellMode: "per_seat",
        priceMode: "per_person",
      }),
      352944,
    )
  })
})

describe("storefrontLineSkuQuantity", () => {
  it("sends 1 SKU unit for a closed table (P87)", () => {
    assert.equal(
      storefrontLineSkuQuantity({
        type: "table",
        capacity: 6,
        sellMode: "group",
        priceMode: "closed_unit",
      }),
      1,
    )
  })

  it("sends chair count for per-person tables", () => {
    assert.equal(
      storefrontLineSkuQuantity({
        type: "table",
        capacity: 6,
        sellMode: "per_seat",
        priceMode: "per_person",
      }),
      6,
    )
  })
})
