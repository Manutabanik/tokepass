import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MISSING_EVENT_FLYER,
  MISSING_EVENT_LOCATION,
  MISSING_SELLABLE_TICKET,
} from "@/lib/events/validate-event-publish"
import { publishEventSchema } from "@/lib/validations/event-form"

function publishPayload(overrides?: {
  basics?: Record<string, unknown>
  venue?: Record<string, unknown>
  tickets?: unknown[]
}) {
  return {
    basics: {
      title: "Fiesta de prueba",
      date: "2026-11-14T20:00",
      endDate: "2026-11-14T23:00",
      description: "",
      flyerName: "flyer.jpg",
      visibility: "public",
      isMultiDay: false,
      scheduleDays: [],
      categoryId: "",
      ageRestriction: "",
      hasSeatingPlan: false,
      hasSchedule: false,
      deliveryMode: "PRESENCIAL",
      accessLink: "",
      ...overrides?.basics,
    },
    venue: {
      mode: "new",
      existingVenueId: null,
      zoneType: "general_admission",
      venueName: "Club Central",
      venueLocation: "San Juan",
      includesSeatingMap: false,
      saveVenueForReuse: true,
      ...overrides?.venue,
    },
    tickets: overrides?.tickets ?? [
      {
        name: "General",
        price: 0,
        capacity: 100,
        visibility: "public",
        layoutType: "general",
        capacityPerUnit: 1,
        admitCount: 1,
      },
    ],
    acceptsMercadoPago: false,
    acceptsPosPayments: false,
  }
}

describe("publishEventSchema completeness", () => {
  it("accepts a complete event without category, description or payment methods", () => {
    const parsed = publishEventSchema.safeParse(publishPayload())
    assert.equal(parsed.success, true)
  })

  it("requires a flyer", () => {
    const parsed = publishEventSchema.safeParse(
      publishPayload({ basics: { flyerName: null } }),
    )
    assert.equal(parsed.success, false)
    assert.ok(
      parsed.success ||
        parsed.error.issues.some((issue) => issue.message === MISSING_EVENT_FLYER),
    )
  })

  it("requires a presencial location", () => {
    const parsed = publishEventSchema.safeParse(
      publishPayload({
        venue: { venueName: "", venueLocation: "" },
      }),
    )
    assert.equal(parsed.success, false)
    assert.ok(
      parsed.success ||
        parsed.error.issues.some(
          (issue) => issue.message === MISSING_EVENT_LOCATION,
        ),
    )
  })

  it("defaults the platform commission to 15%", () => {
    const parsed = publishEventSchema.safeParse(publishPayload())
    assert.equal(parsed.success, true)
    if (parsed.success) {
      assert.equal(parsed.data.serviceFeePercentage, 15)
    }
  })

  it("rejects a platform commission above 95%", () => {
    const parsed = publishEventSchema.safeParse({
      ...publishPayload(),
      serviceFeePercentage: 140,
    })
    assert.equal(parsed.success, false)
  })

  it("requires at least one sellable ticket", () => {
    const parsed = publishEventSchema.safeParse(
      publishPayload({
        tickets: [
          {
            name: "Privada",
            price: 1000,
            capacity: 10,
            visibility: "private",
            layoutType: "general",
            capacityPerUnit: 1,
            admitCount: 1,
          },
        ],
      }),
    )
    assert.equal(parsed.success, false)
    assert.ok(
      parsed.success ||
        parsed.error.issues.some(
          (issue) => issue.message === MISSING_SELLABLE_TICKET,
        ),
    )
  })
})
