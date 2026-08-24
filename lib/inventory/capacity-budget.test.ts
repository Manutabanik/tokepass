import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeEventCapacity,
  occupiesVenueBudget,
  parseStrictInt,
  phaseLimitSum,
  sumVenueOccupyingTicketStock,
  ticketInventorySignature,
  ticketPhasesExceedParent,
  venueCapacityBudget,
} from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"

function ticket(
  patch: Partial<EventFormValues["tickets"][number]> & {
    tierType: EventFormValues["tickets"][number]["tierType"]
    capacity: number
  },
): EventFormValues["tickets"][number] {
  return {
    name: patch.name ?? "Entrada",
    price: patch.price ?? 0,
    basePrice: patch.basePrice ?? patch.price ?? 0,
    feeStrategy: patch.feeStrategy ?? "absorb_in_price",
    calculationMode: patch.calculationMode ?? "public_price",
    capacity: patch.capacity,
    timeLimit: "",
    saleStartsAt: "",
    saleEndsAt: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
    admitCount: 1,
    tierType: patch.tierType,
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
    ...patch,
  }
}

function standingMap(capacity: number) {
  return {
    version: 1,
    elements: [
      {
        type: "standing_zone",
        category: "commercial",
        capacity,
        seats: [],
        sellMode: "group",
      },
    ],
  }
}

describe("capacity-budget", () => {
  it("suma bottom-up sectores generales y deja afuera adicionales", () => {
    const general = ticket({
      tierType: "general",
      capacity: 80,
      seatingSectorId: "general:pista",
    })
    const addon = ticket({ tierType: "addon", capacity: 40 })
    const budget = venueCapacityBudget(0, [general, addon], undefined, {
      zones: [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 100,
        },
      ],
    })
    assert.equal(budget.allocated, 80)
    assert.equal(budget.remaining, 20)
    assert.equal(occupiesVenueBudget(addon), false)
  })

  it("deja afuera combos y adicionales del aforo del recinto", () => {
    const general = ticket({ tierType: "general", capacity: 80 })
    const addon = ticket({ tierType: "addon", capacity: 40 })
    const bundle = ticket({ tierType: "bundle", capacity: 25 })
    const snap = computeEventCapacity({
      tickets: [general, addon, bundle],
      baseVenueCapacity: 100,
    })
    assert.equal(snap.generalAllocatedCapacity, 80)
    assert.equal(snap.totalAllocated, 80)
    assert.equal(snap.exceeded, false)
    assert.equal(occupiesVenueBudget(bundle), false)
  })

  it("sumVenueOccupyingTicketStock ignora adicionales aunque tengan stock alto", () => {
    const tickets = [
      ticket({ tierType: "general", capacity: 100 }),
      ticket({ tierType: "addon", capacity: 500, name: "Estacionamiento" }),
      ticket({ tierType: "addon", capacity: 200, name: "Merch" }),
    ]
    assert.equal(sumVenueOccupyingTicketStock(tickets), 100)
  })

  it("no cuenta dos veces el mapa y las entradas map-backed", () => {
    const mapTicket = ticket({
      tierType: "seated",
      layoutType: "numbered_seat",
      seatingSectorId: "zona-vip",
      capacity: 300,
    })
    const general = ticket({
      tierType: "general",
      capacity: 171,
      seatingSectorId: "general:pista",
    })
    const snap = computeEventCapacity({
      tickets: [mapTicket, general],
      venueMap: standingMap(376),
      zones: [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 171,
        },
      ],
    })
    assert.equal(snap.mapAllocatedCapacity, 376)
    assert.equal(snap.generalSectorCapacity, 171)
    assert.equal(snap.generalAllocatedCapacity, 171)
    assert.equal(snap.totalCapacity, 547)
    assert.equal(snap.totalAllocated, 547)
    assert.equal(snap.exceeded, false)
  })

  it("no bloquea entradas sin sector contra un sector padre", () => {
    const unbound = ticket({
      tierType: "general",
      capacity: 200,
      seatingSectorId: null,
    })
    const snap = computeEventCapacity({
      tickets: [unbound],
      zones: [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 100,
        },
      ],
    })
    assert.equal(snap.unboundGeneralCapacity, 200)
    assert.equal(snap.generalSectorCapacity, 100)
    assert.equal(snap.totalCapacity, 300)
    assert.equal(snap.totalAllocated, 200)
    assert.equal(snap.exceeded, false)
  })

  it("sin plano, el cupo es solo la suma de entradas generales", () => {
    const general = ticket({
      tierType: "general",
      capacity: 80,
      seatingSectorId: null,
    })
    const snap = computeEventCapacity({
      tickets: [general],
      venueMap: standingMap(376),
      hasSeatingPlan: false,
    })
    assert.equal(snap.mapAllocatedCapacity, 0)
    assert.equal(snap.unboundGeneralCapacity, 80)
    assert.equal(snap.totalCapacity, 80)
  })

  it("permite un evento solo con entradas generales, sin sectores ni mapa", () => {
    const general = ticket({
      tierType: "general",
      capacity: 500,
      seatingSectorId: null,
    })
    const snap = computeEventCapacity({
      tickets: [general],
    })
    assert.equal(snap.totalCapacity, 500)
    assert.equal(snap.totalAllocated, 500)
    assert.equal(snap.exceeded, false)
  })

  it("suma el cupo de cada general y no el length del array", () => {
    const tickets = [
      ticket({ tierType: "general", capacity: 10000, seatingSectorId: null }),
    ]
    const snap = computeEventCapacity({ tickets })
    assert.equal(tickets.length, 1)
    assert.equal(snap.unboundGeneralCapacity, 10000)
    assert.equal(snap.totalCapacity, 10000)
    assert.notEqual(
      ticketInventorySignature([{ capacity: 1, tierType: "general" }]),
      ticketInventorySignature([{ capacity: 10000, tierType: "general" }]),
    )
  })

  it("suma mapa + sectores + entradas libres sin doble conteo", () => {
    const unbound = ticket({
      tierType: "general",
      capacity: 80,
      seatingSectorId: null,
    })
    const snap = computeEventCapacity({
      tickets: [unbound],
      venueMap: standingMap(376),
      zones: [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 171,
        },
      ],
    })
    assert.equal(snap.mapAllocatedCapacity, 376)
    assert.equal(snap.generalSectorCapacity, 171)
    assert.equal(snap.unboundGeneralCapacity, 80)
    assert.equal(snap.totalCapacity, 627)
    assert.equal(snap.totalAllocated, 456)
    assert.equal(snap.exceeded, false)
  })

  it("trata el aforo del recinto como techo y no exige igualarlo", () => {
    const general = ticket({
      tierType: "general",
      capacity: 200,
      seatingSectorId: null,
    })
    const snap = computeEventCapacity({
      tickets: [general],
      baseVenueCapacity: 1000,
    })
    assert.equal(snap.totalAllocated, 200)
    assert.equal(snap.totalCapacity, 1000)
    assert.equal(snap.remaining, 800)
    assert.equal(snap.exceeded, false)
  })

  it("marca overflow solo si el stock supera el aforo del recinto", () => {
    const general = ticket({
      tierType: "general",
      capacity: 1200,
      seatingSectorId: null,
    })
    const snap = computeEventCapacity({
      tickets: [general],
      baseVenueCapacity: 1000,
    })
    assert.equal(snap.exceeded, true)
    assert.equal(snap.overflow, 200)
  })

  it("marca overflow si el stock del sector supera su cupo", () => {
    const general = ticket({
      tierType: "general",
      capacity: 200,
      seatingSectorId: "general:pista",
    })
    const snap = computeEventCapacity({
      tickets: [general],
      zones: [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 100,
        },
      ],
    })
    assert.equal(snap.exceeded, true)
    assert.equal(snap.overflow > 0, true)
  })

  it("parsea enteros vacios como UI vacia y NaN invalido", () => {
    assert.equal(parseStrictInt(""), "")
    assert.equal(parseStrictInt("120"), 120)
    assert.equal(Number.isNaN(parseStrictInt("12a")), true)
  })

  it("trata capacidad vacia como 0 en el aforo", () => {
    const general = ticket({ tierType: "general", capacity: Number.NaN })
    const snap = computeEventCapacity({
      tickets: [{ ...general, capacity: undefined }],
      venueMap: standingMap(100),
    })
    assert.equal(snap.generalAllocatedCapacity, 0)
    assert.equal(snap.totalAllocated, 100)
    assert.equal(snap.totalCapacity, 100)
  })

  it("marca overflow si los lotes superan la capacidad padre", () => {
    assert.equal(
      ticketPhasesExceedParent({
        capacity: 50,
        phases: [
          { name: "P1", price: 1, capacityLimit: 30, status: "active" },
          { name: "P2", price: 2, capacityLimit: 30, status: "scheduled" },
        ],
      }),
      true,
    )
    assert.equal(
      ticketPhasesExceedParent({
        capacity: 50,
        phases: [
          { name: "P1", price: 1, capacityLimit: 20, status: "active" },
          { name: "P2", price: 2, capacityLimit: 30, status: "scheduled" },
        ],
      }),
      false,
    )
  })

  it("no deja que la suma de lotes pase el padre", () => {
    const sum = phaseLimitSum([
      { name: "Preventa 1", price: 8000, capacityLimit: 30 },
      { name: "Preventa 2", price: 10000, capacityLimit: 20 },
    ])
    assert.equal(sum, 50)
    assert.equal(
      phaseLimitSum(
        [
          { name: "Preventa 1", price: 8000, capacityLimit: 30 },
          { name: "Preventa 2", price: 10000, capacityLimit: 20 },
        ],
        1,
      ),
      30,
    )
  })
})
