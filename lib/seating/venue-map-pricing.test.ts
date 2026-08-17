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
    assert.equal(next[0]?.id, undefined)
    assert.equal(next[0]?.isNew, true)
    assert.equal(next[0]?.price, 12000)
    assert.equal(next[0]?.tierType, "seated")
    assert.equal(next[0]?.layoutType, "table_combo")
    assert.equal(next[0]?.capacity, 6)
    assert.equal(next[0]?.capacityPerUnit, 8)
    assert.equal(next[1]?.name, "Estacionamiento")
    assert.equal(isMapBackedTicket(next[1]!), false)
  })

  it("elimina tiers de mapa sin ventas cuando el sector desaparece", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-viva",
        name: "Viva",
        color: "#22d3ee",
        price: 5000,
        polygon: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 20,
        labelPrefix: "Viva ",
      },
    ]

    const next = syncMapBackedTickets(
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Zombie",
          price: 9000,
          capacity: 30,
          sold: 0,
          timeLimit: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "numbered_seat",
          seatingSectorId: "zone-borrada",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "seated",
          listPrice: null,
          bundleItems: [],
          description: "",
          highlightBadge: null,
          phases: [],
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Vendida",
          price: 9000,
          capacity: 10,
          sold: 3,
          timeLimit: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "numbered_seat",
          seatingSectorId: "zone-borrada",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "seated",
          listPrice: null,
          bundleItems: [],
          description: "",
          highlightBadge: null,
          phases: [],
        },
        {
          name: "Combo",
          price: 15000,
          capacity: 20,
          timeLimit: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: null,
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "bundle",
          listPrice: 18000,
          bundleItems: [],
          description: "",
          highlightBadge: null,
          phases: [],
        },
      ],
      map,
    )

    assert.equal(next.some((tier) => tier.name === "Zombie"), false)
    assert.equal(next.some((tier) => tier.name === "Vendida"), true)
    assert.equal(next.some((tier) => tier.name === "Combo"), true)
    const created = next.find((tier) => tier.seatingSectorId === "zone-viva")
    assert.equal(created?.id, undefined)
    assert.equal(created?.isNew, true)
  })

  it("canoniza mesa group a table_combo y per_seat a numbered_seat", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "mesa-group",
        type: "round_table",
        label: "Mesa A",
        category: "commercial",
        sectorName: "Mesas",
        x: 10,
        y: 10,
        width: 28,
        height: 28,
        rotation: 0,
        price: 40000,
        color: "#f97316",
        opacity: 1,
        chairCount: 6,
        sideA: 0,
        sideB: 0,
        sellMode: "group",
        capacity: 6,
        seats: [
          { id: "a1", number: 1, x: 0, y: 0, status: "available" },
          { id: "a2", number: 2, x: 1, y: 0, status: "available" },
          { id: "a3", number: 3, x: 2, y: 0, status: "available" },
          { id: "a4", number: 4, x: 3, y: 0, status: "available" },
          { id: "a5", number: 5, x: 4, y: 0, status: "available" },
          { id: "a6", number: 6, x: 5, y: 0, status: "available" },
        ],
      },
      {
        id: "mesa-silla",
        type: "round_table",
        label: "Mesa B",
        category: "commercial",
        sectorName: "Butacas",
        x: 80,
        y: 10,
        width: 28,
        height: 28,
        rotation: 0,
        price: 8000,
        color: "#22d3ee",
        opacity: 1,
        chairCount: 4,
        sideA: 0,
        sideB: 0,
        sellMode: "per_seat",
        capacity: 4,
        seats: [
          { id: "b1", number: 1, x: 0, y: 0, status: "available" },
          { id: "b2", number: 2, x: 1, y: 0, status: "available" },
          { id: "b3", number: 3, x: 2, y: 0, status: "available" },
          { id: "b4", number: 4, x: 3, y: 0, status: "available" },
        ],
      },
    ]

    const next = syncMapBackedTickets([], map)
    const groupSku = next.find((tier) => tier.seatingSectorId === "mesa-group")
    const seatSku = next.find((tier) => tier.seatingSectorId === "mesa-silla")
    assert.equal(groupSku?.layoutType, "table_combo")
    assert.equal(groupSku?.capacityPerUnit, 6)
    assert.equal(seatSku?.layoutType, "numbered_seat")
    assert.equal(seatSku?.capacityPerUnit, 1)
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
