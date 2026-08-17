import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getVenueTemplateMap,
  VENUE_TEMPLATE_CATALOG,
} from "@/lib/constants/venue-templates"
import {
  applyVenuePriceGroup,
  listVenuePriceGroups,
} from "@/lib/seating/venue-price-groups"
import { venueMapHasInventory } from "@/lib/seating/venue-map-geometry"
import { isSellableElement, serializeVenueMap } from "@/types/venue-map"

describe("venue templates", () => {
  it("exposes six catalog entries", () => {
    assert.equal(VENUE_TEMPLATE_CATALOG.length, 6)
  })

  it("loads populated presets instantly without sharing references", () => {
    for (const item of VENUE_TEMPLATE_CATALOG) {
      const first = getVenueTemplateMap(item.id)
      const second = getVenueTemplateMap(item.id)
      if (item.id === "blank") {
        assert.equal(venueMapHasInventory(first), false)
        continue
      }
      assert.equal(venueMapHasInventory(first), true)
      const mutated = first.elements[0]
      if (mutated) mutated.price = 99
      assert.notEqual(second.elements[0]?.price, 99)
    }
  })

  it("applies batch prices to every unit in a sector group", () => {
    const map = getVenueTemplateMap("gala")
    const groups = listVenuePriceGroups(map)
    const mesas = groups.find((group) => group.name === "Mesas de gala")
    assert.ok(mesas)
    assert.equal(mesas.count, 10)
    const priced = applyVenuePriceGroup(map, mesas, 125000)
    assert.ok(priced.elements.every((item) => item.price === 125000))
    assert.equal(map.elements[0]?.price, 0)
  })

  it("keeps bars and restrooms out of commercial price groups", () => {
    const map = getVenueTemplateMap("pena")
    const groups = listVenuePriceGroups(map)
    assert.equal(
      groups.some((group) => /barra|baño/i.test(group.name)),
      false,
    )
    assert.ok(map.elements.some((item) => item.subtype === "bar"))
    assert.ok(map.elements.some((item) => item.subtype === "restroom"))
    assert.ok(
      map.elements
        .filter((item) => item.subtype === "bar" || item.subtype === "restroom")
        .every((item) => item.category === "infrastructure" && item.price === 0),
    )
  })

  it("updates theater seat-block prices without touching the other sector", () => {
    const map = getVenueTemplateMap("theater")
    const groups = listVenuePriceGroups(map)
    const platea = groups.find((group) => group.name === "Platea Baja")
    const pullman = groups.find((group) => group.name === "Pullman")
    assert.ok(platea && pullman)
    const priced = applyVenuePriceGroup(map, platea, 45000)
    assert.equal(
      priced.sectors.find((sector) => sector.id === "platea-baja")?.price,
      45000,
    )
    assert.equal(
      priced.sectors.find((sector) => sector.id === "pullman")?.price,
      0,
    )
  })

  it("serializes infrastructure without a sellable price", () => {
    const map = getVenueTemplateMap("club")
    const saved = serializeVenueMap(map)
    const bars = saved.elements.filter((item) => item.subtype === "bar")
    assert.ok(bars.length > 0)
    assert.ok(bars.every((item) => item.category === "infrastructure"))
    assert.ok(bars.every((item) => item.price === 0))
    assert.ok(bars.every((item) => item.seats.length === 0))
    assert.ok(saved.elements.filter(isSellableElement).every((item) => item.category === "commercial"))
  })
})
