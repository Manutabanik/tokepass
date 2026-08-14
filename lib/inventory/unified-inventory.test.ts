import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  inferInventoryTierType,
  layoutTypeForInventory,
  parseBundleItems,
  parseInventoryTierType,
  serializeBundleItems,
} from "@/lib/inventory/unified-inventory"

describe("unified inventory helpers", () => {
  it("parses known tier types", () => {
    assert.equal(parseInventoryTierType("addon"), "addon")
    assert.equal(parseInventoryTierType("mesa"), null)
  })

  it("infers seated from numbered layout when tier_type is missing", () => {
    assert.equal(
      inferInventoryTierType({ layoutType: "numbered_seat" }),
      "seated",
    )
    assert.equal(
      inferInventoryTierType({ layoutType: "table_combo" }),
      "seated",
    )
  })

  it("infers bundle from category or included items", () => {
    assert.equal(
      inferInventoryTierType({ category: "bundle", layoutType: "general" }),
      "bundle",
    )
    assert.equal(
      inferInventoryTierType({
        layoutType: "general",
        bundleItems: [{ tierId: "a", quantity: 2 }],
      }),
      "bundle",
    )
  })

  it("keeps table_combo layout for seated inventory", () => {
    assert.equal(
      layoutTypeForInventory("seated", "table_combo"),
      "table_combo",
    )
    assert.equal(layoutTypeForInventory("addon"), "general")
  })

  it("round-trips bundle items from camelCase or snake_case", () => {
    const parsed = parseBundleItems([
      { tierId: "11111111-1111-4111-8111-111111111111", quantity: 2 },
      { tier_id: "22222222-2222-4222-8222-222222222222", quantity: 1 },
      { quantity: 0 },
    ])
    assert.equal(parsed.length, 2)
    assert.deepEqual(serializeBundleItems(parsed), [
      { tier_id: "11111111-1111-4111-8111-111111111111", quantity: 2 },
      { tier_id: "22222222-2222-4222-8222-222222222222", quantity: 1 },
    ])
  })
})
