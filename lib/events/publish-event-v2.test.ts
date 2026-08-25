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
    assert.equal(payload.location, "Niceto")
    assert.equal(payload.visibility, "public")
    assert.equal(payload.refund_policy, "no_refunds")
    assert.equal(payload.description, "Gracias por venir")
    assert.equal(payload.flyer_url, "https://cdn.example/flyer.jpg")
    assert.equal(payload.social_share_image_url, "https://cdn.example/banner.jpg")
    assert.equal(payload.venue.name, "Niceto")
    assert.equal(payload.venue.capacity, 200)
    assert.equal(payload.tickets.length, 2)
    assert.equal(payload.tickets[0]?.id, "550e8400-e29b-41d4-a716-446655440000")
    assert.equal(payload.tickets[0]?.tier_type, "general")
    assert.equal(payload.tickets[0]?.category, "standard")
    assert.equal(payload.tickets[0]?.layout_type, "general")
    assert.equal(payload.tickets[0]?.price, 10000)
    assert.ok((payload.tickets[0]?.base_price ?? 0) < 10000)
    assert.equal(payload.tickets[1]?.tier_type, "addon")
    assert.equal(payload.tickets[1]?.category, "special")
    assert.equal(payload.tickets[1]?.id, null)
    assert.match(payload.date, /^2026-09-0[12]T/)
  })

  it("keeps general tickets off the seating map and skips nameless extras", () => {
    const draft = publishableDraft()
    draft.seatingMap = { url: "https://cdn.example/map.png", sectors: [{ id: "a" }] }
    const payload = buildPublishEventV2Payload(draft)
    assert.deepEqual(payload.venue_map, draft.seatingMap)
    assert.ok(payload.tickets.every((ticket) => ticket.layout_type === "general"))
    assert.equal(
      payload.tickets.filter((ticket) => ticket.tier_type === "addon").length,
      1,
    )
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
