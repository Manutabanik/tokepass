import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  PROMO_TEMPLATE_2X1,
  PROMO_TEMPLATE_SECOND_HALF,
  bundleSavings,
  inferBundleType,
  promotionalBundlePrice,
  regularBundlePrice,
  validateBundleDraft,
} from "@/lib/inventory/flexible-bundles"

describe("flexible bundles", () => {
  it("computes regular price from included tiers", () => {
    assert.equal(
      regularBundlePrice(
        [
          { tierId: "a", quantity: 3 },
          { tierId: "b", quantity: 1 },
        ],
        { a: 10000, b: 5000 },
      ),
      35000,
    )
  })

  it("computes savings amount and percent", () => {
    const save = bundleSavings(90000, 65000)
    assert.equal(save.amount, 25000)
    assert.equal(save.percent, 28)
  })

  it("infers volume discount from a single component with qty > 1", () => {
    assert.equal(
      inferBundleType({
        items: [{ tierId: "g", quantity: 4 }],
        componentTierTypes: { g: "general" },
      }),
      "volume_discount",
    )
  })

  it("calculates 2x1 from X_POR_Y", () => {
    assert.equal(
      promotionalBundlePrice({
        items: [{ tierId: "g", quantity: 2 }],
        unitPriceByTierId: { g: 10000 },
        rule: PROMO_TEMPLATE_2X1,
      }),
      10000,
    )
  })

  it("calculates 50% on the second unit", () => {
    assert.equal(
      promotionalBundlePrice({
        items: [{ tierId: "g", quantity: 2 }],
        unitPriceByTierId: { g: 10000 },
        rule: PROMO_TEMPLATE_SECOND_HALF,
      }),
      15000,
    )
  })

  it("applies a fixed amount off the pack", () => {
    assert.equal(
      promotionalBundlePrice({
        items: [
          { tierId: "a", quantity: 1 },
          { tierId: "b", quantity: 1 },
        ],
        unitPriceByTierId: { a: 20000, b: 8000 },
        rule: {
          tipoDescuento: "MONTO_FIJO",
          valorDescuento: 5000,
          cantidadRequerida: 1,
          cantidadPaga: 1,
        },
      }),
      23000,
    )
  })

  it("applies 2x1 per complete group and leftover units", () => {
    assert.equal(
      promotionalBundlePrice({
        items: [{ tierId: "g", quantity: 3 }],
        unitPriceByTierId: { g: 10000 },
        rule: PROMO_TEMPLATE_2X1,
      }),
      20000,
    )
  })

  it("rejects drafts without components", () => {
    assert.equal(
      validateBundleDraft({
        name: "Pack",
        items: [],
        price: 1000,
        capacity: 10,
      }),
      "Elegí al menos una entrada incluida.",
    )
  })
})
