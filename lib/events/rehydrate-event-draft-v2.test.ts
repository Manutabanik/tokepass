import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isEventDraftStateEmpty,
  overlayLiveExperienceOnDraft,
  rehydrateEventDraftV2,
} from "@/lib/events/rehydrate-event-draft-v2"
import { emptyEventDraftV2 } from "@/lib/validations/event-draft-v2"

describe("isEventDraftStateEmpty", () => {
  it("treats null, arrays and {} as empty", () => {
    assert.equal(isEventDraftStateEmpty(null), true)
    assert.equal(isEventDraftStateEmpty({}), true)
    assert.equal(isEventDraftStateEmpty([]), true)
    assert.equal(isEventDraftStateEmpty({ basicInfo: { name: "After" } }), false)
  })
})

describe("rehydrateEventDraftV2", () => {
  it("builds a draft sandbox from published relational rows", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "After",
        date: "2026-09-01T22:00:00-03:00",
        ends_at: "2026-09-02T04:00:00-03:00",
        location: "Av. Córdoba 1234, CABA",
        description: "Gracias por venir",
        flyer_url: "https://cdn.example/flyer.jpg",
        image_url: null,
        social_share_image_url: "https://cdn.example/banner.jpg",
        visibility: "public",
        refund_policy: "no_refunds",
        province: "Ciudad Autónoma de Buenos Aires",
        department: "Comuna 1",
        delivery_mode: "PRESENCIAL",
        promo_video_url: "https://youtu.be/dQw4w9WgXcQ",
        gallery_urls: ["https://cdn.example/exp.jpg"],
        restrictions: "+18",
        what_to_bring: "DNI",
        venue_map: {
          version: 1,
          sectors: [
            {
              id: "sector-platea",
              name: "Platea",
              color: "#f97316",
              price: 18000,
              x: 0,
              y: 0,
              rows: 1,
              seatsPerRow: 1,
              curvature: 0,
              aisle: false,
              seats: [
                { id: "s1", row: "1", number: 1, x: 0, y: 0, status: "available" },
              ],
            },
          ],
        },
      },
      venue: {
        name: "Niceto",
        location: "Av. Córdoba 1234, CABA",
        address: "Av. Córdoba 1234",
        city: "Comuna 1",
        latitude: -34.6037,
        longitude: -58.3816,
        capacity: 200,
        max_capacity: 200,
        venue_map: null,
      },
      lineup: [
        {
          id: "550e8400-e29b-41d4-a716-446655440077",
          name: "Wos",
          avatarUrl: "https://cdn.example/wos.jpg",
          role: "Headliner",
          source: "local",
          dayIds: [],
        },
      ],
      tickets: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "VIP",
          description: "Acceso preferencial",
          price: 25000,
          capacity: 40,
          min_purchase_limit: 1,
          max_purchase_limit: 6,
          tier_type: "general",
          category: "standard",
          layout_type: "general",
          seating_sector_id: null,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440099",
          name: "Platea",
          description: null,
          price: 18000,
          capacity: 24,
          min_purchase_limit: 1,
          max_purchase_limit: 4,
          tier_type: "seated",
          category: "standard",
          layout_type: "numbered_seat",
          seating_sector_id: "sector-platea",
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440088",
          name: "Cerveza",
          description: null,
          price: 4000,
          capacity: 50,
          min_purchase_limit: 1,
          max_purchase_limit: 10,
          tier_type: "addon",
          category: "special",
          layout_type: "general",
          seating_sector_id: null,
        },
      ],
    })

    assert.equal(draft.basicInfo.name, "After")
    assert.equal(draft.location.venueName, "Niceto")
    assert.equal(draft.location.address, "Av. Córdoba 1234")
    assert.equal(draft.venueCapacity, 200)
    assert.equal(draft.settings.isPublic, true)
    assert.equal(draft.settings.refundPolicy, "no_refunds")
    assert.equal(draft.tickets.length, 2)
    assert.equal(draft.tickets[0]?.name, "VIP")
    assert.equal(draft.tickets[0]?.ticketType, "standard")
    assert.equal(draft.tickets[0]?.source, "general")
    assert.equal(draft.tickets[1]?.source, "map")
    assert.equal(draft.tickets[1]?.sectorId, "sector-platea")
    assert.equal(draft.extras[0]?.name, "Cerveza")
    assert.equal(draft.extras[0]?.ticketType, "extra")
    assert.equal(draft.seatingMap.sectors[0]?.id, "sector-platea")
    assert.equal(draft.schedule.length, 1)
    assert.equal(draft.schedule[0]?.name, "Día 1")
    assert.ok(draft.schedule[0]?.startDate)
    assert.equal(draft.basicInfo.startDate, draft.schedule[0]?.startDate)
    assert.equal(draft.promoVideoUrl, "https://youtu.be/dQw4w9WgXcQ")
    assert.deepEqual(draft.galleryUrls, ["https://cdn.example/exp.jpg"])
    assert.equal(draft.restrictions, "+18")
    assert.equal(draft.whatToBring, "DNI")
    assert.equal(draft.lineup[0]?.name, "Wos")
    assert.equal(draft.lineup[0]?.source, "local")
  })

  it("rebuilds a multi-day schedule from schedule_days", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "Festival",
        date: "2026-09-01T18:00:00-03:00",
        ends_at: "2026-09-02T23:30:00-03:00",
        location: "Av. Córdoba 1234, CABA",
        description: null,
        flyer_url: null,
        image_url: null,
        social_share_image_url: null,
        visibility: "public",
        refund_policy: "organizer",
        province: "Ciudad Autónoma de Buenos Aires",
        department: "Comuna 1",
        delivery_mode: "PRESENCIAL",
        venue_map: null,
        schedule_days: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            title: "Día 1",
            start_time: "2026-09-01T18:00:00-03:00",
            end_time: "2026-09-01T23:00:00-03:00",
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440002",
            title: "Función Noche",
            start_time: "2026-09-02T20:00:00-03:00",
            end_time: "2026-09-02T23:30:00-03:00",
          },
        ],
      },
      venue: {
        name: "Niceto",
        location: "Av. Córdoba 1234, CABA",
        address: "Av. Córdoba 1234",
        city: "Comuna 1",
        latitude: -34.6037,
        longitude: -58.3816,
        capacity: 200,
        max_capacity: 200,
        venue_map: null,
      },
      tickets: [],
    })
    assert.equal(draft.schedule.length, 2)
    assert.equal(draft.schedule[0]?.name, "Día 1")
    assert.equal(draft.schedule[1]?.name, "Función Noche")
    assert.ok(draft.schedule[0]?.startDate)
    assert.ok(draft.schedule[1]?.endDate)
  })

  it("marks streaming venues as online without a physical address", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "Stream",
        date: "2026-09-01T22:00:00-03:00",
        ends_at: null,
        location: "Online",
        description: null,
        flyer_url: null,
        image_url: null,
        social_share_image_url: null,
        visibility: "private",
        refund_policy: "organizer",
        province: null,
        department: null,
        delivery_mode: "ONLINE",
        venue_map: null,
      },
      venue: {
        name: "Streaming / Online",
        location: "Online",
        address: null,
        city: null,
        latitude: null,
        longitude: null,
        capacity: 100,
        max_capacity: 100,
        venue_map: null,
      },
      tickets: [],
    })
    assert.equal(draft.settings.deliveryMode, "ONLINE")
    assert.equal(draft.isVirtual, true)
    assert.equal(draft.archetype, "show")
    assert.equal(draft.location.venueName, "")
    assert.equal(draft.location.address, "")
  })
})

describe("overlayLiveExperienceOnDraft", () => {
  it("fills missing experience keys from live columns", () => {
    const overlay = overlayLiveExperienceOnDraft(
      emptyEventDraftV2(),
      {
        promoVideoUrl: "https://youtu.be/dQw4w9WgXcQ",
        galleryUrls: ["https://cdn.example/exp.jpg"],
        restrictions: "+18",
        whatToBring: "DNI",
        lineup: [
          {
            id: "a1",
            name: "Wos",
            avatarUrl: "",
            role: "",
            source: "custom",
            dayIds: [],
          },
        ],
      },
      { basicInfo: { name: "After" } },
    )
    assert.equal(overlay.changed, true)
    assert.equal(overlay.draft.restrictions, "+18")
    assert.equal(overlay.draft.whatToBring, "DNI")
    assert.equal(overlay.draft.lineup[0]?.name, "Wos")
  })

  it("does not restore fields the draft already stored as empty", () => {
    const overlay = overlayLiveExperienceOnDraft(
      {
        ...emptyEventDraftV2(),
        restrictions: "",
        whatToBring: "",
        lineup: [],
      },
      {
        restrictions: "+18",
        whatToBring: "DNI",
        lineup: [
          {
            id: "a1",
            name: "Wos",
            avatarUrl: "",
            role: "",
            source: "custom",
            dayIds: [],
          },
        ],
      },
      {
        restrictions: "",
        whatToBring: "",
        lineup: [],
      },
    )
    assert.equal(overlay.changed, false)
    assert.equal(overlay.draft.restrictions, "")
    assert.deepEqual(overlay.draft.lineup, [])
  })
})
