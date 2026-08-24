import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { healEventFormInventory } from "./heal-event-form-inventory"
import { emptyVenueMap } from "@/types/venue-map"

function baseForm() {
  return {
    basics: {
      title: "Test",
      date: "",
      endDate: "",
      description: "",
      flyerName: null,
      visibility: "public" as const,
      isMultiDay: false,
      scheduleDays: [],
      categoryId: "",
      ageRestriction: "atp" as const,
      hasSeatingPlan: true,
      hasSchedule: false,
      deliveryMode: "PRESENCIAL" as const,
      accessLink: "",
    },
    venue: {
      mode: "new" as const,
      existingVenueId: null,
      zoneType: "general_admission" as const,
      venueName: "Lugar",
      includesSeatingMap: true,
      saveVenueForReuse: true,
      venueMap: emptyVenueMap(),
    },
    tickets: [
      {
        name: "General",
        price: 1000,
        basePrice: 1000,
        capacity: 100,
        layoutType: "general" as const,
        seatingSectorId: null,
        tierType: "general" as const,
      },
      {
        name: "Sector Naranja",
        price: 5000,
        basePrice: 5000,
        capacity: 40,
        layoutType: "general" as const,
        seatingSectorId: "orphan-sector",
        tierType: "seated" as const,
      },
      {
        name: "Sector Naranja",
        price: 5000,
        basePrice: 5000,
        capacity: 40,
        layoutType: "general" as const,
        seatingSectorId: "orphan-sector",
        tierType: "seated" as const,
      },
    ],
    ticketsDefaultTab: "auto" as const,
    lineup: [],
    acceptsMercadoPago: true,
    acceptsPosPayments: true,
    defaultFeeStrategy: "absorb_in_price" as const,
    serviceFeePercentage: 15,
    refundPolicy: "organizer" as const,
  }
}

describe("healEventFormInventory", () => {
  it("desactiva el mapa y desacopla tickets map-backed cuando no hay sectores", () => {
    const healed = healEventFormInventory(baseForm() as never)
    assert.equal(healed.basics.hasSeatingPlan, false)
    assert.equal(healed.venue.includesSeatingMap, false)
    assert.equal(healed.tickets.length, 3)
    assert.equal(healed.tickets[0]?.name, "General")
    assert.equal(healed.tickets[1]?.seatingSectorId, null)
    assert.equal(healed.tickets[2]?.seatingSectorId, null)
  })
})
