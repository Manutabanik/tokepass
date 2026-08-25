import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  asPublishUuid,
  buildPublishEventV2Payload,
  composePublishDescription,
  draftDateToIso,
  formatEventPublishIssues,
  freePublishCapacity,
} from "@/lib/events/publish-event-v2"
import { emptyEventDraftV2, eventPublishSchema } from "@/lib/validations/event-draft-v2"

function publishableDraft() {
  return {
    ...emptyEventDraftV2(),
    basicInfo: {
      name: "After",
      startDate: "2026-09-01T22:00",
      endDate: "2026-09-02T04:00",
      locationName: "Niceto",
    },
    flyerUrl: "https://cdn.example/flyer.jpg",
    bannerUrl: "https://cdn.example/banner.jpg",
    venueCapacity: 200,
    tickets: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "General",
        description: "Acceso",
        price: 10000,
        stock: 80,
        minOrder: 1,
        maxOrder: 6,
      },
    ],
    extras: [
      {
        id: "item-extra",
        name: "Cerveza",
        description: "",
        price: 4000,
        stock: 50,
        minOrder: 1,
        maxOrder: 10,
      },
      {
        id: "skip-me",
        name: "",
        description: "",
        price: 0,
        stock: 0,
        minOrder: 1,
        maxOrder: 10,
      },
    ],
    location: {
      venueName: "Niceto",
      address: "Av. Córdoba 1234, CABA",
      province: "Ciudad Autónoma de Buenos Aires",
      city: "Comuna 1",
      lat: -34.6037,
      lng: -58.3816,
    },
    settings: {
      isPublic: true,
      absorbFees: true,
      refundPolicy: "no_refunds",
      checkoutMessage: "Gracias por venir",
    },
  }
}

describe("eventPublishSchema issues", () => {
  it("returns exact paths when the draft is incomplete", () => {
    const result = eventPublishSchema.safeParse(emptyEventDraftV2())
    assert.equal(result.success, false)
    if (result.success) return
    const issues = formatEventPublishIssues(result.error.issues)
    assert.ok(issues.some((issue) => issue.path.includes("basicInfo.name")))
    assert.ok(issues.some((issue) => issue.message.length > 0))
  })
})

describe("buildPublishEventV2Payload", () => {
  it("maps draft JSON onto relational event, venue and ticket rows", () => {
    const payload = buildPublishEventV2Payload(publishableDraft(), {
      platformFeePercentage: 10,
      platformFixedFee: 0,
      maxFreeTickets: 100,
      isSponsoredByTokePass: false,
    })
    assert.equal(payload.title, "After")
    assert.equal(payload.venue.name, "Niceto")
    assert.match(payload.location, /Córdoba 1234/)
    assert.equal(payload.venue.city, "Comuna 1")
    assert.equal(payload.venue.latitude, -34.6037)
    assert.equal(payload.delivery_mode, "PRESENCIAL")
    assert.equal(payload.visibility, "public")
    assert.equal(payload.refund_policy, "no_refunds")
    assert.equal(payload.description, "Gracias por venir")
    assert.equal(payload.flyer_url, "https://cdn.example/flyer.jpg")
    assert.equal(payload.social_share_image_url, "https://cdn.example/banner.jpg")
    assert.equal(payload.venue.capacity, 200)
    assert.equal(payload.tickets.length, 2)
    assert.equal(payload.tickets[0]?.id, "550e8400-e29b-41d4-a716-446655440000")
    assert.equal(payload.tickets[0]?.tier_type, "general")
    assert.equal(payload.tickets[0]?.category, "standard")
    assert.equal(payload.tickets[0]?.layout_type, "general")
    assert.equal(payload.tickets[0]?.seating_sector_id, null)
    assert.equal(payload.has_seating_plan, false)
    assert.equal(payload.tickets[0]?.price, 10000)
    assert.ok((payload.tickets[0]?.base_price ?? 0) < 10000)
    assert.equal(payload.tickets[1]?.tier_type, "addon")
    assert.equal(payload.tickets[1]?.category, "special")
    assert.equal(payload.tickets[1]?.id, null)
    assert.match(payload.date, /^2026-09-0[12]T/)
  })

  it("keeps general tickets off the seating map and skips nameless extras", () => {
    const draft = publishableDraft()
    draft.seatingMap = {
      ...draft.seatingMap,
      url: "https://cdn.example/map.png",
      backgroundImage: "https://cdn.example/map.png",
      sectors: [{ id: "a" }],
    }
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(typeof payload.venue_map, "object")
    assert.ok(
      payload.tickets
        .filter((ticket) => ticket.tier_type === "general")
        .every((ticket) => ticket.seating_sector_id == null),
    )
    assert.equal(
      payload.tickets.filter((ticket) => ticket.tier_type === "addon").length,
      1,
    )
  })

  it("unpacks map tickets with seating sector ids", () => {
    const draft = publishableDraft()
    draft.tickets.push({
      id: "map-platea",
      name: "Platea",
      description: "",
      price: 18000,
      stock: 24,
      minOrder: 1,
      maxOrder: 4,
      source: "map",
      sectorId: "sector-platea",
      layoutType: "numbered_seat",
    })
    draft.seatingMap = {
      ...draft.seatingMap,
      version: 1,
      url: "",
      sectors: [
        {
          id: "sector-platea",
          name: "Platea",
          color: "#f97316",
          price: 18000,
          x: 0,
          y: 0,
          rows: 1,
          seatsPerRow: 2,
          curvature: 0,
          aisle: false,
          seats: [
            { id: "s1", row: "1", number: 1, x: 0, y: 0, status: "available" },
            { id: "s2", row: "1", number: 2, x: 10, y: 0, status: "available" },
          ],
        },
      ],
    }
    const payload = buildPublishEventV2Payload(draft)
    const seated = payload.tickets.find((ticket) => ticket.name === "Platea")
    const general = payload.tickets.find((ticket) => ticket.name === "General")
    assert.equal(payload.has_seating_plan, true)
    assert.equal(seated?.tier_type, "seated")
    assert.equal(seated?.layout_type, "numbered_seat")
    assert.equal(seated?.seating_sector_id, "sector-platea")
    assert.equal(general?.tier_type, "general")
    assert.equal(general?.seating_sector_id, null)
  })

  it("maps private visibility and free-text refund into description", () => {
    const draft = publishableDraft()
    draft.settings.isPublic = false
    draft.settings.refundPolicy = "Reintegro a criterio"
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.visibility, "private")
    assert.equal(payload.refund_policy, "organizer")
    assert.match(payload.description, /Reintegro a criterio/)
  })
})

describe("publish helpers", () => {
  it("accepts only real UUIDs as ticket ids", () => {
    assert.equal(asPublishUuid("t1"), null)
    assert.equal(asPublishUuid("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000")
  })

  it("converts datetime-local values to ISO", () => {
    const iso = draftDateToIso("2026-09-01T22:00")
    assert.equal(Number.isNaN(Date.parse(iso)), false)
  })

  it("does not count paid tickets as free capacity", () => {
    const payload = buildPublishEventV2Payload(publishableDraft())
    assert.equal(freePublishCapacity(payload), 0)
  })

  it("falls back to the title when there is no checkout copy", () => {
    assert.equal(
      composePublishDescription({ title: "After" }),
      "After",
    )
  })
})
