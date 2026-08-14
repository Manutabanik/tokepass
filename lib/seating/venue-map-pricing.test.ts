import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isMapBackedTicket,
  migrateLegacyWizardStep,
  syncMapBackedTickets,
  venueMapToPricingMap,
} from "@/lib/seating/venue-map-pricing"
import { emptyVenueMap } from "@/types/venue-map"

describe("venue-map-pricing", () => {
  it("arma venuePricingMap desde zonas y sectores del Studio", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "sector-vip",
        name: "VIP",
        color: "#f97316",
        price: 25000,
        x: 10,
        y: 10,
        rows: 1,
        seatsPerRow: 2,
        curvature: 0,
        aisle: false,
        seats: [
          {
            id: "s1",
            row: "1",
            number: 1,
            x: 10,
            y: 10,
            status: "available",
          },
          {
            id: "s2",
            row: "1",
            number: 2,
            x: 28,
            y: 10,
            status: "available",
          },
        ],
      },
    ]
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 400,
        labelPrefix: "Campo ",
      },
    ]

    const pricing = venueMapToPricingMap(map)
    assert.equal(pricing["sector-vip"], 25000)
    assert.equal(pricing.VIP, 25000)
    assert.equal(pricing["zone-campo"], 8000)
    assert.equal(pricing.Campo, 8000)
  })

  it("sincroniza ticket_tiers ocultos del mapa sin tocar combos", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-naranja",
        name: "Naranja",
        color: "#f97316",
        price: 12000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "table_combo",
        sellMode: "group",
        rows: 2,
        itemsPerRow: 3,
        capacityPerUnit: 8,
        capacity: 48,
        labelPrefix: "Mesa ",
      },
    ]

    const next = syncMapBackedTickets(
      [
        {
          name: "Estacionamiento",
          price: 3000,
          capacity: 80,
          timeLimit: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: null,
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "addon",
          listPrice: null,
          bundleItems: [],
          description: "",
          highlightBadge: null,
        },
      ],
      map,
    )

    assert.equal(next.length, 2)
    assert.equal(next[0]?.seatingSectorId, "zone-naranja")
    assert.equal(next[0]?.price, 12000)
    assert.equal(next[0]?.tierType, "seated")
    assert.equal(next[1]?.name, "Estacionamiento")
    assert.equal(isMapBackedTicket(next[1]!), false)
  })

  it("migra el paso persistido del wizard de 5 a 4", () => {
    assert.equal(migrateLegacyWizardStep(0), 0)
    assert.equal(migrateLegacyWizardStep(1), 1)
    assert.equal(migrateLegacyWizardStep(2), 1)
    assert.equal(migrateLegacyWizardStep(3), 2)
    assert.equal(migrateLegacyWizardStep(4), 3)
    assert.equal(migrateLegacyWizardStep(9), 3)
  })
})
