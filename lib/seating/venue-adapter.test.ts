import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { OrganizerVenue } from "../../app/actions/venues"
import {
  buildEmptyPricingMap,
  mapVenueToUniversalSeatData,
} from "./venue-adapter"

function baseVenue(
  overrides: Partial<OrganizerVenue> = {},
): OrganizerVenue {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Teatro Test",
    location: "Calle 1",
    address: "Calle 1",
    city: "CABA",
    latitude: null,
    longitude: null,
    capacity: 100,
    zoneBlueprint: [],
    seatingLayout: [],
    venueMap: {
      version: 1,
      stage: null,
      labels: [],
      aisles: [],
      sectors: [],
      elements: [],
      backgroundImage: null,
      backgroundOpacity: 0.4,
      backgroundScale: 1,
      backgroundX: 0,
      backgroundY: 0,
    },
    seatingBackgroundUrl: "https://example.com/map.png",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("mapVenueToUniversalSeatData", () => {
  it("maps general + numbered seating layout with prices", () => {
    const venue = baseVenue({
      seatingLayout: [
        {
          id: "sec-general",
          sector_name: "Campo",
          color: "#10b981",
          pricing_tier_id: null,
          layout_type: "general",
          capacity_per_unit: 1,
          rows: [],
        },
        {
          id: "sec-vip",
          sector_name: "VIP",
          color: "#f97316",
          pricing_tier_id: null,
          layout_type: "numbered_seat",
          capacity_per_unit: 1,
          rows: [
            {
              row_id: "fila-1",
              row_number: 1,
              row_label: "Fila 1",
              items: [
                {
                  id: "s1",
                  label: "1",
                  capacity: 1,
                  status: "available",
                },
                {
                  id: "s2",
                  label: "2",
                  capacity: 1,
                  status: "blocked",
                },
              ],
            },
          ],
        },
      ],
    })

    const payload = mapVenueToUniversalSeatData(venue, {
      "sec-general": 15000,
      "sec-vip": { price: 40000, groupPrices: { "fila-1": 45000 } },
    })

    assert.equal(payload.mapImageUrl, "https://example.com/map.png")
    assert.equal(payload.sectors.length, 2)
    assert.equal(payload.sectors[0]?.type, "general")
    assert.equal(payload.sectors[0]?.price, 15000)
    assert.equal(payload.sectors[1]?.type, "numbered")
    assert.equal(payload.sectors[1]?.price, 40000)
    const numbered = payload.sectors[1]
    assert.ok(numbered && numbered.type === "numbered")
    assert.deepEqual(
      numbered.groups[0]?.seats.map((s) => s.status),
      ["available", "blocked"],
    )
  })

  it("falls back to zone blueprint when layout is empty", () => {
    const venue = baseVenue({
      zoneBlueprint: [
        {
          name: "Platea",
          type: "reserved_seating",
          capacity: 20,
          rows: 2,
          seatsPerRow: 5,
        },
      ],
    })

    const payload = mapVenueToUniversalSeatData(venue, {
      Platea: 22000,
    })

    assert.equal(payload.sectors.length, 1)
    assert.equal(payload.sectors[0]?.type, "numbered")
    assert.equal(payload.sectors[0]?.price, 22000)
    assert.ok(payload.sectors[0]?.type === "numbered")
    assert.equal(payload.sectors[0].groups.length, 2)
    assert.equal(payload.sectors[0].groups[0]?.seats.length, 5)
  })

  it("buildEmptyPricingMap keys sectors", () => {
    const venue = baseVenue({
      seatingLayout: [
        {
          id: "a",
          sector_name: "A",
          color: "#fff",
          pricing_tier_id: null,
          layout_type: "general",
          capacity_per_unit: 1,
          rows: [],
        },
      ],
    })
    assert.deepEqual(buildEmptyPricingMap(venue), { a: 0 })
  })
})
