import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  capPublicSkuAvailable,
  occupiedVenueUnitsForDay,
  publicCatalogTicketsLeft,
  publicTierAvailable,
} from "@/lib/inventory/public-stock-cap"

describe("public venue stock cap", () => {
  it("never advertises more than the remaining venue capacity for the day", () => {
    const general = {
      id: "ga",
      capacity: 400,
      sold: 50,
      day_id: "day-1",
      visibility: "public",
      tier_type: "general",
    }
    const vip = {
      id: "vip",
      capacity: 80,
      sold: 10,
      day_id: "day-1",
      visibility: "public",
      tier_type: "general",
    }
    const available = publicTierAvailable({
      tier: general,
      tiers: [general, vip],
      venueCapacity: 100,
      skuAvailable: 350,
    })
    assert.equal(available, 40)
    assert.equal(
      capPublicSkuAvailable({ skuAvailable: 350, venueRemaining: 40 }),
      40,
    )
  })

  it("does not cap addon SKUs with the building aforo", () => {
    const drink = {
      id: "trago",
      capacity: 500,
      sold: 20,
      day_id: null,
      visibility: "public",
      tier_type: "addon",
    }
    assert.equal(
      publicTierAvailable({
        tier: drink,
        tiers: [drink],
        venueCapacity: 100,
        skuAvailable: 480,
      }),
      480,
    )
  })

  it("caps catalog ticketsLeft by venue capacity", () => {
    const inventory = publicCatalogTicketsLeft({
      venueCapacity: 100,
      tiers: [
        { capacity: 80, sold: 10, visibility: "public" },
        { capacity: 80, sold: 10, visibility: "public" },
      ],
    })
    assert.equal(inventory.ticketsLeft, 80)
  })

  it("counts a sold table_combo by people, not by tables", () => {
    const mesa = {
      id: "mesa",
      capacity: 10,
      sold: 1,
      day_id: "day-1",
      visibility: "public",
      tier_type: "seated",
      layout_type: "table_combo",
      capacity_per_unit: 6,
    }
    assert.equal(occupiedVenueUnitsForDay([mesa], "day-1"), 6)
    assert.equal(
      publicTierAvailable({
        tier: mesa,
        tiers: [mesa],
        venueCapacity: 10,
        skuAvailable: 9,
      }),
      0,
    )
    assert.equal(
      publicTierAvailable({
        tier: mesa,
        tiers: [mesa],
        venueCapacity: 20,
        skuAvailable: 9,
      }),
      2,
    )
  })
})
