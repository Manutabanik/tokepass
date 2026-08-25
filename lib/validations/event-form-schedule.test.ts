import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { coerceDraftEventForm, type DraftEventFormValues } from "@/lib/validations/event-form"

function draftWithDays(
  isMultiDay: boolean,
  scheduleDays: DraftEventFormValues["basics"]["scheduleDays"],
): DraftEventFormValues {
  return {
    basics: {
      title: "Festival Test",
      date: "2026-11-14T20:00",
      endDate: "2026-11-14T23:00",
      description: "",
      flyerName: null,
      visibility: "public",
      isMultiDay,
      scheduleDays,
      categoryId: "",
      ageRestriction: "",
    },
    venue: {
      mode: "new",
      existingVenueId: null,
      zoneType: "general_admission",
      venueName: "Club",
      includesSeatingMap: false,
      saveVenueForReuse: true,
    },
    tickets: [
      {
        name: "General",
        price: 10000,
        capacity: 100,
        visibility: "public",
        layoutType: "general",
        capacityPerUnit: 1,
        admitCount: 1,
      },
    ],
    ticketsDefaultTab: "auto",
    lineup: [],
  }
}

describe("multi-day draft coercion", () => {
  it("keeps isMultiDay and both jornadas when dates are complete", () => {
    const coerced = coerceDraftEventForm(
      draftWithDays(true, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Día 1",
          startTime: "2026-11-14T20:00",
          endTime: "2026-11-15T04:00",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Día 2",
          startTime: "2026-11-15T20:00",
          endTime: "2026-11-16T04:00",
        },
      ]),
    )
    assert.equal(coerced.basics.isMultiDay, true)
    assert.equal(coerced.basics.scheduleDays.length, 2)
    assert.equal(coerced.basics.scheduleDays[0]?.title, "Día 1")
    assert.equal(coerced.basics.scheduleDays[1]?.title, "Día 2")
  })

  it("does not flip a single-day event to multi-day", () => {
    const coerced = coerceDraftEventForm(draftWithDays(false, []))
    assert.equal(coerced.basics.isMultiDay, false)
    assert.equal(coerced.basics.scheduleDays.length, 0)
  })

  it("clears ticket day ids that no longer match the official jornadas", () => {
    const liveDay = "11111111-1111-4111-8111-111111111111"
    const staleDay = "99999999-9999-4999-8999-999999999999"
    const coerced = coerceDraftEventForm({
      ...draftWithDays(true, [
        {
          id: liveDay,
          title: "Día 1",
          startTime: "2026-11-14T20:00",
          endTime: "2026-11-15T04:00",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Día 2",
          startTime: "2026-11-15T20:00",
          endTime: "2026-11-16T04:00",
        },
      ]),
      tickets: [
        {
          name: "General Día 1",
          price: 10000,
          capacity: 100,
          visibility: "public",
          layoutType: "general",
          capacityPerUnit: 1,
          admitCount: 1,
          dayId: liveDay,
        },
        {
          name: "General viejo",
          price: 10000,
          capacity: 100,
          visibility: "public",
          layoutType: "general",
          capacityPerUnit: 1,
          admitCount: 1,
          dayId: staleDay,
        },
      ],
    })
    assert.equal(coerced.tickets[0]?.dayId, liveDay)
    assert.equal(coerced.tickets[1]?.dayId, null)
  })

  it("clears dayId on combo / full-pass tickets", () => {
    const liveDay = "11111111-1111-4111-8111-111111111111"
    const coerced = coerceDraftEventForm({
      ...draftWithDays(true, [
        {
          id: liveDay,
          title: "Día 1",
          startTime: "2026-11-14T20:00",
          endTime: "2026-11-15T04:00",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Día 2",
          startTime: "2026-11-15T20:00",
          endTime: "2026-11-16T04:00",
        },
      ]),
      tickets: [
        {
          name: "Abono",
          price: 20000,
          capacity: 50,
          visibility: "public",
          layoutType: "general",
          capacityPerUnit: 1,
          admitCount: 1,
          dayId: liveDay,
          tierType: "bundle",
        },
      ],
    })
    assert.equal(coerced.tickets[0]?.dayId, null)
  })

  it("keeps a short name and a ticket without sector instead of dropping the row", () => {
    const coerced = coerceDraftEventForm({
      ...draftWithDays(false, []),
      tickets: [
        {
          name: "A",
          price: 0,
          capacity: 10,
          visibility: "public",
          layoutType: "general",
          capacityPerUnit: 1,
          admitCount: 1,
        },
        {
          name: "",
          price: 2500,
          capacity: 20,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: null,
          capacityPerUnit: 1,
          admitCount: 1,
        },
      ],
    })
    assert.equal(coerced.tickets.length, 2)
    assert.equal(coerced.tickets[0]?.name, "A")
    assert.equal(coerced.tickets[0]?.visibility, "private")
    assert.equal(coerced.tickets[1]?.name, "Borrador")
    assert.equal(coerced.tickets[1]?.visibility, "private")
    assert.equal(coerced.tickets[1]?.price, 2500)
  })

  it("does not invent a placeholder ticket when the draft has none", () => {
    const coerced = coerceDraftEventForm({
      ...draftWithDays(false, []),
      tickets: [
        {
          name: "",
          price: 0,
          capacity: 1,
          visibility: "public",
          layoutType: "general",
          capacityPerUnit: 1,
          admitCount: 1,
        },
      ],
    })
    assert.equal(coerced.tickets.length, 0)
  })

  it("keeps unnamed map-sector tickets so they are not dropped on save", () => {
    const coerced = coerceDraftEventForm({
      ...draftWithDays(false, []),
      tickets: [
        {
          name: "  ",
          price: 8000,
          capacity: 50,
          visibility: "public",
          layoutType: "general",
          seatingSectorId: "zone-campo",
          capacityPerUnit: 1,
          admitCount: 1,
        },
      ],
    })
    assert.equal(coerced.tickets.length, 1)
    assert.equal(coerced.tickets[0]?.seatingSectorId, "zone-campo")
  })

  it("does not invent venue, age or dates when drafting", () => {
    const coerced = coerceDraftEventForm(
      {
        basics: {
          title: "Borrador nuevo",
          date: "",
          endDate: "",
          description: "",
          flyerName: null,
          visibility: "public",
          isMultiDay: false,
          scheduleDays: [],
          categoryId: "",
          ageRestriction: "",
        },
        venue: {
          mode: "new",
          existingVenueId: null,
          zoneType: "general_admission",
          venueName: "",
          includesSeatingMap: false,
          saveVenueForReuse: true,
        },
        tickets: [],
      },
      { inventPlaceholders: false },
    )
    assert.equal(coerced.basics.date, "")
    assert.equal(coerced.basics.endDate, "")
    assert.equal(coerced.basics.ageRestriction, "")
    assert.equal(coerced.venue.venueName, "")
    assert.equal(coerced.venue.capacity, undefined)
  })
})
