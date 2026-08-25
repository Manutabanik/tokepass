import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mergePersistedEventForm } from "@/lib/events/merge-persisted-event-form"
import type { EventFormValues } from "@/lib/validations/event-form"

function ticket(
  overrides: Partial<EventFormValues["tickets"][number]> = {},
): EventFormValues["tickets"][number] {
  return {
    name: "General",
    price: 1000,
    capacity: 50,
    visibility: "public",
    layoutType: "general",
    capacityPerUnit: 1,
    admitCount: 1,
    ...overrides,
  } as EventFormValues["tickets"][number]
}

function form(
  overrides: Partial<EventFormValues> = {},
): EventFormValues {
  return {
    basics: {
      title: "Mi fiesta",
      date: "",
      endDate: "",
      description: "",
      flyerName: null,
      visibility: "public",
      isMultiDay: false,
      scheduleDays: [],
      categoryId: "",
      ageRestriction: "",
      hasSeatingPlan: false,
      hasSchedule: false,
      deliveryMode: "PRESENCIAL",
      accessLink: "",
    },
    venue: {
      mode: "new",
      existingVenueId: null,
      zoneType: "general_admission",
      venueName: "",
      venueLocation: "",
      includesSeatingMap: false,
      saveVenueForReuse: true,
    },
    tickets: [ticket({ name: "" })],
    ticketsDefaultTab: "auto",
    lineup: [],
    acceptsMercadoPago: true,
    acceptsPosPayments: true,
    defaultFeeStrategy: "pass_to_customer",
    serviceFeePercentage: 8,
    refundPolicy: "organizer",
    ...overrides,
  } as EventFormValues
}

describe("mergePersistedEventForm", () => {
  it("keeps empty dates and venue and only copies server ids", () => {
    const current = form({
      tickets: [ticket({ name: "General" })],
    })
    const server = form({
      basics: {
        ...form().basics,
        date: "2026-09-01T20:00",
        endDate: "2026-09-01T23:00",
        ageRestriction: "atp",
        flyerName: "Flyer actual",
      },
      venue: {
        ...form().venue,
        venueName: "Por definir",
        existingVenueId: "11111111-1111-4111-8111-111111111111",
        capacity: 1,
      },
      tickets: [
        ticket({
          id: "22222222-2222-4222-8222-222222222222",
          name: "General",
        }),
      ],
    })

    const merged = mergePersistedEventForm(current, server)
    assert.equal(merged.basics.date, "")
    assert.equal(merged.basics.ageRestriction, "")
    assert.equal(merged.venue.venueName, "")
    assert.equal(
      merged.venue.existingVenueId,
      "11111111-1111-4111-8111-111111111111",
    )
    assert.equal(merged.tickets[0]?.id, "22222222-2222-4222-8222-222222222222")
    assert.equal(merged.basics.flyerName, "Flyer actual")
  })

  it("does not overwrite a ticket id the form already has", () => {
    const current = form({
      tickets: [
        ticket({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "VIP",
        }),
      ],
    })
    const server = form({
      tickets: [
        ticket({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "VIP",
        }),
      ],
    })
    const merged = mergePersistedEventForm(current, server)
    assert.equal(merged.tickets[0]?.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
  })
})
