import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeCapacityThermometer } from "@/lib/inventory/capacity-thermometer"
import type { EventFormValues } from "@/lib/validations/event-form"
import { eventFormTicket } from "@/tests/fixtures/event-form"
import { emptyVenueMap } from "@/types/venue-map"

function ticket(
  patch: Partial<EventFormValues["tickets"][number]> & {
    tierType: EventFormValues["tickets"][number]["tierType"]
    capacity: number
  },
): EventFormValues["tickets"][number] {
  return eventFormTicket({ name: "Entrada", ...patch })
}

describe("capacity thermometer", () => {
  it("sums general stock plus map seats against the venue max", () => {
    const venueMap = emptyVenueMap()
    venueMap.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 0,
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
        capacity: 120,
        labelPrefix: "Campo ",
      },
    ]
    const snap = computeCapacityThermometer({
      tickets: [
        ticket({ tierType: "general", capacity: 80 }),
        ticket({ tierType: "addon", capacity: 40 }),
      ],
      venueMap,
      venueCapacity: 150,
    })
    assert.equal(snap.generalStock, 80)
    assert.equal(snap.mapCapacity, 120)
    assert.equal(snap.used, 200)
    assert.equal(snap.venueMax, 150)
    assert.equal(snap.overCapacity, true)
    assert.equal(snap.overflow, 50)
  })

  it("does not warn when the mix stays under the recinto", () => {
    const snap = computeCapacityThermometer({
      tickets: [ticket({ tierType: "general", capacity: 40 })],
      venueCapacity: 200,
    })
    assert.equal(snap.used, 40)
    assert.equal(snap.overCapacity, false)
    assert.equal(snap.remaining, 160)
    assert.equal(snap.ratio < 1, true)
  })

  it("does not invent a venue max of 1 when the recinto has no aforo", () => {
    const snap = computeCapacityThermometer({
      tickets: [ticket({ tierType: "general", capacity: 40 })],
      venueCapacity: undefined,
    })
    assert.equal(snap.venueMax, 0)
    assert.equal(snap.overCapacity, false)
    assert.equal(snap.ratio, 0)
  })
})
