import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyMapCapacityToTickets,
  consolidateEventTicketsForPersist,
  eventNeedsInteractiveCanvas,
  isMapBackedTicket,
  layoutTypeForMapSectorId,
  migrateLegacyWizardStep,
  sectorUsesNumberedMap,
  syncMapBackedTickets,
  ticketRequiresInteractiveMap,
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
          saleStartsAt: "",
          saleEndsAt: "",
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
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
      map,
    )

    assert.equal(next.length, 2)
    const parking = next.find((tier) => tier.name === "Estacionamiento")
    const mapped = next.find((tier) => tier.seatingSectorId === "zone-naranja")
    assert.equal(parking?.name, "Estacionamiento")
    assert.equal(isMapBackedTicket(parking!), false)
    assert.equal(mapped?.id, undefined)
    assert.equal(mapped?.isNew, true)
    assert.equal(mapped?.price, 12000)
    assert.equal(mapped?.tierType, "seated")
    assert.equal(mapped?.layoutType, "table_combo")
    assert.equal(mapped?.capacity, 48)
    assert.equal(mapped?.capacityPerUnit, 8)
    assert.equal(next[0]?.name, "Estacionamiento")
  })

  it("conserva el precio cargado en la tarjeta al re-guardar el mapa", () => {
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
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 48,
        labelPrefix: "Naranja ",
      },
    ]

    const next = syncMapBackedTickets(
      [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          name: "Naranja",
          price: 18500,
          capacity: 40,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: "zone-naranja",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
      map,
    )

    assert.equal(next[0]?.price, 18500)
    assert.equal(next[0]?.capacity, 48)
  })

  it("no inventa entradas de mapa si solo hay generales sin sector", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "",
      },
    ]
    const next = consolidateEventTicketsForPersist({
      basics: {
        hasSeatingPlan: true,
        scheduleDays: [],
      },
      venue: { venueMap: map, includesSeatingMap: true },
      tickets: [
        {
          name: "Estacionamiento",
          price: 3000,
          capacity: 80,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
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
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
    } as Parameters<typeof consolidateEventTicketsForPersist>[0])
    assert.equal(next.some((tier) => tier.seatingSectorId === "zone-campo"), false)
    assert.equal(next.some((tier) => tier.name === "Estacionamiento"), true)
  })

  it("elimina tickets con seating_sector_id huerfano si el evento ya no usa mapa", () => {
    const next = consolidateEventTicketsForPersist({
      basics: {
        hasSeatingPlan: false,
        scheduleDays: [],
      },
      venue: { includesSeatingMap: false },
      tickets: [
        {
          name: "Fantasma",
          price: 5000,
          capacity: 80,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: "sector-borrado",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
        {
          name: "General",
          price: 5000,
          capacity: 40,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: null,
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
    } as Parameters<typeof consolidateEventTicketsForPersist>[0])
    assert.equal(next.some((tier) => tier.name === "Fantasma"), false)
    assert.equal(next[0]?.name, "General")
    assert.equal(next[0]?.seatingSectorId, null)
  })

  it("conserva entradas generales y extras aunque tengan sectorId residual", () => {
    const next = consolidateEventTicketsForPersist({
      basics: {
        hasSeatingPlan: false,
        scheduleDays: [],
      },
      venue: { includesSeatingMap: false },
      tickets: [
        {
          name: "Entrada General",
          price: 5000,
          capacity: 40,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: null,
          seating_sector_id: null,
          sectorId: "sector-residual",
          source: "general",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
        {
          name: "Estacionamiento",
          price: 2000,
          capacity: 20,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: undefined,
          seating_sector_id: undefined,
          sectorId: "sector-residual",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
    } as Parameters<typeof consolidateEventTicketsForPersist>[0])
    assert.equal(next.some((tier) => tier.name === "Entrada General"), true)
    assert.equal(next.some((tier) => tier.name === "Estacionamiento"), true)
    assert.equal(next.every((tier) => tier.seatingSectorId == null), true)
  })

  it("re-vincula un ticket de mapa por nombre si el seating_sector_id cambio", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "",
      },
    ]
    const next = consolidateEventTicketsForPersist({
      basics: {
        hasSeatingPlan: true,
        scheduleDays: [],
      },
      venue: { venueMap: map, includesSeatingMap: true },
      tickets: [
        {
          name: "Campo",
          price: 8000,
          capacity: 100,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: "zone-viejo",
          seating_sector_id: "zone-viejo",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
    } as Parameters<typeof consolidateEventTicketsForPersist>[0])
    assert.equal(next.some((tier) => tier.seatingSectorId === "zone-campo"), true)
    assert.equal(next.some((tier) => tier.seatingSectorId === "zone-viejo"), false)
  })

  it("consolida inventario libre con entradas ya ligadas al mapa", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "",
      },
    ]
    const next = consolidateEventTicketsForPersist({
      basics: {
        hasSeatingPlan: true,
        scheduleDays: [],
      },
      venue: { venueMap: map, includesSeatingMap: true },
      tickets: [
        {
          name: "Campo",
          price: 8000,
          capacity: 100,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: "zone-campo",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
        {
          name: "Estacionamiento",
          price: 3000,
          capacity: 80,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
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
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
    } as Parameters<typeof consolidateEventTicketsForPersist>[0])
    assert.equal(next.some((tier) => tier.seatingSectorId === "zone-campo"), true)
    assert.equal(next.some((tier) => tier.name === "Estacionamiento"), true)
  })

  it("conserva entradas generales sin seating_sector_id junto al mapa", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "",
      },
    ]
    const next = consolidateEventTicketsForPersist({
      basics: {
        hasSeatingPlan: true,
        scheduleDays: [],
      },
      venue: { venueMap: map, includesSeatingMap: true },
      tickets: [
        {
          name: "Campo mapa",
          price: 8000,
          capacity: 100,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: "zone-campo",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
        {
          name: "Entrada General",
          price: 4000,
          capacity: 50,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
          bonusReward: "",
          dayId: null,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: null,
          source: "general",
          capacityPerUnit: 1,
          admitCount: 1,
          tierType: "general",
          listPrice: null,
          bundleItems: [],
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
        },
      ],
    } as Parameters<typeof consolidateEventTicketsForPersist>[0])
    assert.equal(next.some((tier) => tier.name === "Entrada General"), true)
    assert.equal(
      next.find((tier) => tier.name === "Entrada General")?.seatingSectorId,
      null,
    )
    assert.equal(next.some((tier) => tier.seatingSectorId === "zone-campo"), true)
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
          saleStartsAt: "",
          saleEndsAt: "",
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
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
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
          saleStartsAt: "",
          saleEndsAt: "",
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
          bundleType: null,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
          description: "",
          highlightBadge: null,
          phases: [],
        },
        {
          name: "Combo",
          price: 15000,
          capacity: 20,
          timeLimit: "",
          saleStartsAt: "",
          saleEndsAt: "",
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
          bundleType: "cross_sell_pack",
          promoDiscountType: "PORCENTAJE",
          promoDiscountValue: 0,
          promoRequiredQty: 1,
          promoPayQty: 1,
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
    assert.equal(created?.tierType, "general")
    assert.equal(created?.layoutType, "general")
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

  it("hereda sillas del mapa al vincular un ticket a un sector", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "mesa-1",
        type: "round_table",
        label: "Mesa 1",
        category: "commercial",
        sectorName: "VIP",
        x: 10,
        y: 10,
        width: 28,
        height: 28,
        rotation: 0,
        price: 50000,
        color: "#f97316",
        opacity: 1,
        chairCount: 8,
        sideA: 0,
        sideB: 0,
        sellMode: "group",
        capacity: 8,
        seats: Array.from({ length: 8 }, (_, index) => ({
          id: `s${index + 1}`,
          number: index + 1,
          x: index,
          y: 0,
          status: "available" as const,
        })),
      },
    ]
    const next = applyMapCapacityToTickets(
      [
        {
          name: "Mesa VIP",
          seatingSectorId: "mesa-1",
          layoutType: "numbered_seat" as const,
          capacityPerUnit: 1,
        },
      ],
      map,
    )
    assert.equal(next[0]?.layoutType, "table_combo")
    assert.equal(next[0]?.capacityPerUnit, 8)
    assert.equal(next[0]?.capacity, 8)
  })

  it("migra el paso persistido del wizard de 5 a 4", () => {
    assert.equal(migrateLegacyWizardStep(0), 0)
    assert.equal(migrateLegacyWizardStep(1), 1)
    assert.equal(migrateLegacyWizardStep(2), 1)
    assert.equal(migrateLegacyWizardStep(3), 2)
    assert.equal(migrateLegacyWizardStep(4), 3)
    assert.equal(migrateLegacyWizardStep(9), 3)
  })

  it("nunca trata un sector general: como map-backed", () => {
    assert.equal(
      isMapBackedTicket({
        seatingSectorId: null,
        layoutType: "numbered_seat",
        tierType: "seated",
      }),
      false,
    )
    assert.equal(
      isMapBackedTicket({
        source: "general",
        seatingSectorId: "sector-residual",
        layoutType: "general",
        tierType: "general",
      }),
      false,
    )
    assert.equal(
      isMapBackedTicket({
        seatingSectorId: "general:pista",
        layoutType: "numbered_seat",
        tierType: "seated",
      }),
      false,
    )
    assert.equal(
      ticketRequiresInteractiveMap({
        seating_sector_id: "general:campo",
        layout_type: "general",
        tier_type: "general",
      }),
      false,
    )
  })

  it("no enciende el canvas si no hay tickets ligados al mapa", () => {
    const map = emptyVenueMap()
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
    assert.equal(
      eventNeedsInteractiveCanvas(map, [
        { seating_sector_id: "general:pista", layout_type: "general" },
      ]),
      false,
    )
    assert.equal(
      eventNeedsInteractiveCanvas(map, [
        { seatingSectorId: "zona-vip", layoutType: "numbered_seat" },
      ]),
      true,
    )
    assert.equal(
      eventNeedsInteractiveCanvas(null, [
        { seatingSectorId: "zona-vip", layoutType: "numbered_seat" },
      ]),
      false,
    )
    assert.equal(
      eventNeedsInteractiveCanvas(
        map,
        [{ seatingSectorId: "zona-vip", layoutType: "numbered_seat" }],
        { hasSeatingPlan: false },
      ),
      false,
    )
  })

  it("routes numbered sectors to the map and GA sectors to the counter", () => {
    assert.equal(
      sectorUsesNumberedMap({ layoutType: "numbered_seat" }),
      true,
    )
    assert.equal(sectorUsesNumberedMap({ layoutType: "general" }), false)
    assert.equal(
      sectorUsesNumberedMap({ seatingSectorId: "general:pista" }),
      false,
    )
    assert.equal(
      sectorUsesNumberedMap({
        seatingSectorId: "campo",
        sectors: [{ id: "campo", type: "general" }],
      }),
      false,
    )
    assert.equal(
      sectorUsesNumberedMap({
        seatingSectorId: "platea",
        sectors: [{ id: "platea", type: "numbered" }],
      }),
      true,
    )
    const emptyReserved = emptyVenueMap()
    emptyReserved.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "table_combo",
        seatingType: "RESERVED",
        sellMode: "group",
        rows: 4,
        itemsPerRow: 10,
        capacityPerUnit: 8,
        capacity: 40,
        labelPrefix: "Mesa ",
      },
    ]
    assert.equal(
      sectorUsesNumberedMap({
        seatingSectorId: "campo",
        layoutType: "table_combo",
        map: emptyReserved,
      }),
      true,
    )
    assert.equal(
      ticketRequiresInteractiveMap({
        seatingSectorId: "campo",
        layoutType: "general",
        tierType: "general",
        map: emptyReserved,
      }),
      true,
    )
    assert.equal(
      eventNeedsInteractiveCanvas(emptyReserved, [
        { seatingSectorId: "campo", layoutType: "general", tierType: "general" },
      ]),
      true,
    )
    assert.equal(
      eventNeedsInteractiveCanvas(
        emptyReserved,
        [{ seatingSectorId: "campo", layoutType: "general" }],
        { hasSeatingPlan: false },
      ),
      false,
    )
  })

  it("no pide modal de asientos para una zona GA aunque el ticket diga numbered", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zona-1",
        name: "Zona 1",
        color: "#22d3ee",
        price: 5000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "general",
        seatingType: "GENERAL",
        sellMode: "per_seat",
        rows: 0,
        itemsPerRow: 0,
        capacityPerUnit: 1,
        capacity: 200,
        labelPrefix: "Campo ",
      },
    ]
    assert.equal(
      sectorUsesNumberedMap({
        seatingSectorId: "zona-1",
        layoutType: "numbered_seat",
        map,
      }),
      false,
    )
    assert.equal(
      ticketRequiresInteractiveMap({
        seatingSectorId: "zona-1",
        layoutType: "numbered_seat",
        map,
      }),
      false,
    )
    assert.equal(
      sectorUsesNumberedMap({
        layoutType: "numbered_seat",
        map,
      }),
      false,
    )
  })

  it("no pide plano a una entrada general aunque el recinto tenga mesas", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "mesa-1",
        type: "round_table",
        label: "Mesa 1",
        category: "commercial",
        sectorName: "VIP",
        x: 10,
        y: 10,
        width: 28,
        height: 28,
        rotation: 0,
        price: 50000,
        color: "#f97316",
        opacity: 1,
        chairCount: 8,
        sideA: 0,
        sideB: 0,
        sellMode: "group",
        capacity: 8,
        seats: [],
      },
    ]
    assert.equal(
      sectorUsesNumberedMap({
        layoutType: "general",
        map,
      }),
      false,
    )
    assert.equal(
      ticketRequiresInteractiveMap({
        layoutType: "general",
        tierType: "general",
        map,
      }),
      false,
    )
  })

  it("expande un sector de mapa a un ticket por día", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 200,
        labelPrefix: "Campo ",
      },
    ]
    const next = syncMapBackedTickets([], map, {
      defaultDayId: "day-a",
      dayIds: ["day-a", "day-b"],
    })
    const sectorTickets = next.filter(
      (tier) => tier.seatingSectorId === "zone-campo",
    )
    assert.equal(sectorTickets.length, 2)
    assert.equal(sectorTickets[0]?.dayId, "day-a")
    assert.equal(sectorTickets[1]?.dayId, "day-b")
    assert.equal(sectorTickets[0]?.price, 8000)
    assert.equal(sectorTickets[1]?.price, 8000)
  })

  it("treats a general zone with drawn tables as table_combo inventory", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "grada-amarilla",
        name: "Grada Amarilla",
        color: "#eab308",
        price: 12000,
        polygon: [],
        layoutType: "general",
        sellMode: "group",
        rows: 0,
        itemsPerRow: 0,
        capacityPerUnit: 8,
        capacity: 8,
        labelPrefix: "T",
      },
    ]
    map.elements = [
      {
        id: "mesa-08",
        type: "long_table",
        label: "Tablón 08",
        category: "commercial",
        x: 0,
        y: 0,
        width: 80,
        height: 24,
        rotation: 0,
        price: 12000,
        color: "#eab308",
        opacity: 1,
        chairCount: 8,
        sellMode: "group",
        capacity: 8,
        groupId: "grada-amarilla",
        zoneId: "grada-amarilla",
        seats: [],
      },
    ]
    assert.equal(layoutTypeForMapSectorId(map, "grada-amarilla"), "table_combo")
  })
})
