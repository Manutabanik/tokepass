import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSeatingPersistMismatchError,
  prepareEventForPersist,
} from "./prepare-event-persist"
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
        name: "Sector Naranja",
        price: 5000,
        basePrice: 5000,
        capacity: 40,
        layoutType: "general" as const,
        seatingSectorId: "missing-sector",
        tierType: "seated" as const,
      },
      {
        name: "Sector Naranja",
        price: 5000,
        basePrice: 5000,
        capacity: 40,
        layoutType: "general" as const,
        seatingSectorId: "missing-sector",
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

describe("prepareEventForPersist", () => {
  it("deduplica entradas y desacopla sectores inválidos del mapa", () => {
    const prepared = prepareEventForPersist(baseForm() as never, {
      mode: "update",
    })
    assert.equal(prepared.basics.hasSeatingPlan, false)
    assert.equal(prepared.tickets.length, 1)
    assert.equal(prepared.tickets[0]?.layoutType, "general")
    assert.equal(prepared.tickets[0]?.seatingSectorId, null)
  })

  it("detecta errores de seating persist", () => {
    assert.equal(
      isSeatingPersistMismatchError(
        "El mapa y las entradas no coinciden. Revisá sectores y precios.",
      ),
      true,
    )
    assert.equal(
      isSeatingPersistMismatchError("SEATING_TIER_CONFIG_AMBIGUOUS: Sector"),
      true,
    )
  })
})
