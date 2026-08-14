import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  occupiesVenueBudget,
  phaseLimitSum,
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

describe("capacity-budget", () => {
  it("resta generales del aforo y deja afuera adicionales", () => {
    const general = ticket({ tierType: "general", capacity: 80 })
    const addon = ticket({ tierType: "addon", capacity: 40 })
    const budget = venueCapacityBudget(100, [general, addon])
    assert.equal(budget.allocated, 80)
    assert.equal(budget.remaining, 20)
    assert.equal(occupiesVenueBudget(addon), false)
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
