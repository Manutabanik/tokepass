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

  it("elimina General huérfano sin jornada cuando hay filas por día", () => {
    const dayA = "8510c8f6-06f8-4eaa-9bc8-bb936f43f176"
    const dayB = "1135985a-9c6b-46ba-b0a4-ee84022f7ebf"
    const form = {
      ...baseForm(),
      basics: {
        ...baseForm().basics,
        hasSeatingPlan: false,
        isMultiDay: true,
        scheduleDays: [
          { id: dayA, title: "Día 1", start_time: "2026-11-07T14:00", end_time: "2026-11-07T23:00" },
          { id: dayB, title: "Día 2", start_time: "2026-11-08T14:00", end_time: "2026-11-08T22:00" },
        ],
      },
      venue: {
        ...baseForm().venue,
        includesSeatingMap: false,
      },
      tickets: [
        {
          id: "cfb00578-8de3-4be6-ab25-0d0837ee4447",
          name: "General",
          price: 1000,
          basePrice: 1000,
          capacity: 528,
          sold: 0,
          dayId: null,
          layoutType: "general" as const,
          tierType: "general" as const,
        },
        {
          name: "General",
          price: 1000,
          basePrice: 1000,
          capacity: 528,
          sold: 0,
          dayId: dayA,
          layoutType: "general" as const,
          tierType: "general" as const,
        },
        {
          name: "General",
          price: 1000,
          basePrice: 1000,
          capacity: 528,
          sold: 0,
          dayId: dayB,
          layoutType: "general" as const,
          tierType: "general" as const,
        },
        {
          name: "Estacionamiento Auto",
          price: 3450,
          basePrice: 3000,
          capacity: 1000,
          sold: 0,
          dayId: null,
          layoutType: "general" as const,
          tierType: "addon" as const,
        },
      ],
    }
    const prepared = prepareEventForPersist(form as never, { mode: "update" })
    assert.equal(prepared.tickets.length, 3)
    assert.ok(
      !prepared.tickets.some(
        (tier) =>
          tier.name === "General" &&
          !tier.dayId &&
          tier.id === "cfb00578-8de3-4be6-ab25-0d0837ee4447",
      ),
    )
    assert.equal(
      prepared.tickets.filter((tier) => tier.name === "General").length,
      2,
    )
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
