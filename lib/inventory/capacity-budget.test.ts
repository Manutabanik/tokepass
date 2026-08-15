import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeEventCapacity,
  occupiesVenueBudget,
  parseStrictInt,
  phaseLimitSum,
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
    capacity: patch.capacity,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
    tierType: patch.tierType,
    listPrice: null,
    bundleItems: [],
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
  it("resta generales del aforo y deja afuera adicionales", () => {
    const general = ticket({ tierType: "general", capacity: 80 })
    const addon = ticket({ tierType: "addon", capacity: 40 })
    const budget = venueCapacityBudget(100, [general, addon])
    assert.equal(budget.allocated, 80)
    assert.equal(budget.remaining, 20)
    assert.equal(occupiesVenueBudget(addon), false)
  })

  it("no cuenta dos veces el mapa y las entradas map-backed", () => {
    const mapTicket = ticket({
      tierType: "seated",
      layoutType: "numbered_seat",
      seatingSectorId: "zona-vip",
      capacity: 300,
    })
    const general = ticket({ tierType: "general", capacity: 171 })
    const snap = computeEventCapacity({
      tickets: [mapTicket, general],
      venueMap: standingMap(376),
      baseVenueCapacity: 376,
      customMaxCapacity: null,
    })
    assert.equal(snap.mapAllocatedCapacity, 376)
    assert.equal(snap.generalAllocatedCapacity, 171)
    assert.equal(snap.totalAllocated, 547)
    assert.equal(snap.effectiveMaxCapacity, 376)
    assert.equal(snap.exceeded, true)
    assert.equal(snap.overflow, 171)
    assert.equal(snap.remaining, 0)
  })

  it("customMaxCapacity permite predio mixto asientos + campo", () => {
    const general = ticket({ tierType: "general", capacity: 1000 })
    const snap = computeEventCapacity({
      tickets: [general],
      venueMap: standingMap(300),
      baseVenueCapacity: 300,
      customMaxCapacity: 1300,
    })
    assert.equal(snap.mapAllocatedCapacity, 300)
    assert.equal(snap.generalAllocatedCapacity, 1000)
    assert.equal(snap.totalAllocated, 1300)
    assert.equal(snap.effectiveMaxCapacity, 1300)
    assert.equal(snap.exceeded, false)
    assert.equal(snap.remaining, 0)
  })

  it("effectiveMaxCapacity usa el mayor entre aforo oficial y el expandido", () => {
    const snap = computeEventCapacity({
      tickets: [],
      venueMap: standingMap(300),
      baseVenueCapacity: 300,
      customMaxCapacity: 200,
    })
    assert.equal(snap.effectiveMaxCapacity, 300)
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
      baseVenueCapacity: 100,
    })
    assert.equal(snap.generalAllocatedCapacity, 0)
    assert.equal(snap.totalAllocated, 100)
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
