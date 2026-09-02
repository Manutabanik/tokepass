import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isEventDraftStateEmpty,
  overlayLiveExperienceOnDraft,
  overlayLivePurchaseCopyOnDraft,
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
          base_price: 22000,
          capacity: 40,
          min_purchase_limit: 1,
          max_purchase_limit: 6,
          tier_type: "general",
          category: "standard",
          layout_type: "general",
          seating_sector_id: null,
          day_id: "550e8400-e29b-41d4-a716-446655440001",
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
          ticket_type: "standard",
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
    assert.equal(draft.settings.absorbFees, false)
    assert.equal(draft.settings.refundPolicy, "no_refunds")
    assert.equal(draft.tickets.length, 2)
    assert.equal(draft.tickets[0]?.name, "VIP")
    assert.equal(draft.tickets[0]?.price, 25000)
    assert.equal(draft.settings.checkoutMessage, "Gracias por venir")
    assert.equal(draft.tickets[0]?.ticketType, "standard")
    assert.deepEqual(draft.tickets[0]?.validDayIds, [
      "550e8400-e29b-41d4-a716-446655440001",
    ])
    assert.equal(draft.tickets[0]?.source, "general")
    assert.equal(draft.tickets[1]?.source, "map")
    assert.equal(draft.tickets[1]?.sectorId, "sector-platea")
    assert.equal(draft.extras[0]?.name, "Cerveza")
    assert.equal(draft.extras[0]?.ticketType, "extra")
    assert.equal(
      (draft.seatingMap.sectors as Array<{ id: string }>)[0]?.id,
      "sector-platea",
    )
    assert.equal(draft.schedule.length, 1)
    assert.equal(draft.schedule[0]?.name, "Día 1")
    assert.ok(draft.schedule[0]?.startDate)
    assert.equal(draft.basicInfo.startDate, draft.schedule[0]?.startDate)
    assert.equal(
      draft.promoVideoUrl,
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
    assert.deepEqual(draft.galleryUrls, ["https://cdn.example/exp.jpg"])
    assert.equal(draft.restrictions, "+18")
    assert.equal(draft.whatToBring, "DNI")
    assert.equal(draft.lineup[0]?.name, "Wos")
    assert.equal(draft.lineup[0]?.source, "local")
  })

  it("restores the online access link and ticket sale windows", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "Clase",
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
        access_link: "https://meet.example/aula",
        venue_map: null,
      },
      venue: null,
      tickets: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "General",
          description: null,
          price: 5000,
          capacity: 20,
          min_purchase_limit: 1,
          max_purchase_limit: 4,
          tier_type: "general",
          category: "standard",
          layout_type: "general",
          seating_sector_id: null,
          sale_starts_at: "2026-08-20T13:00:00.000Z",
          sale_ends_at: "2026-08-31T02:59:00.000Z",
        },
      ],
    })
    assert.equal(draft.virtualLink, "https://meet.example/aula")
    assert.equal(draft.settings.isPublic, false)
    assert.ok(draft.tickets[0]?.startDate)
    assert.ok(draft.tickets[0]?.endDate)
  })

  it("restores absorbFees from events.absorb_fees", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "After",
        date: "2026-09-01T22:00:00-03:00",
        ends_at: null,
        location: "CABA",
        description: null,
        flyer_url: null,
        image_url: null,
        social_share_image_url: null,
        visibility: "public",
        refund_policy: "organizer",
        province: null,
        department: null,
        delivery_mode: "PRESENCIAL",
        venue_map: null,
        absorb_fees: true,
      },
      venue: null,
      tickets: [],
    })
    assert.equal(draft.settings.absorbFees, true)
  })

  it("reads checkout_message from the dedicated column", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "After",
        date: "2026-09-01T22:00:00-03:00",
        ends_at: null,
        location: "CABA",
        description: "After",
        flyer_url: null,
        image_url: null,
        social_share_image_url: null,
        visibility: "public",
        refund_policy: "until_24h",
        province: null,
        department: null,
        delivery_mode: "PRESENCIAL",
        venue_map: null,
        checkout_message: "Nos vemos en la puerta",
      },
      venue: null,
      tickets: [],
    })
    assert.equal(draft.settings.checkoutMessage, "Nos vemos en la puerta")
    assert.equal(draft.settings.refundPolicy, "until_24h")
  })

  it("restores per-day seatingMaps from published seating_maps rows", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440010"
    const dayB = "550e8400-e29b-41d4-a716-446655440011"
    const mapA = {
      version: 1,
      sectors: [
        {
          id: "sector-a",
          name: "Sala A",
          color: "#22c55e",
          price: 10000,
          x: 0,
          y: 0,
          rows: 1,
          seatsPerRow: 1,
          curvature: 0,
          aisle: false,
          seats: [{ id: "a1", row: "1", number: 1, x: 0, y: 0, status: "available" }],
        },
      ],
    }
    const mapB = {
      ...mapA,
      sectors: [{ ...mapA.sectors[0], id: "sector-b", name: "Sala B" }],
    }
    const draft = rehydrateEventDraftV2({
      event: {
        title: "Festival",
        date: "2026-09-01T22:00:00-03:00",
        ends_at: "2026-09-02T04:00:00-03:00",
        location: "Niceto",
        description: null,
        flyer_url: null,
        image_url: null,
        social_share_image_url: null,
        visibility: "public",
        refund_policy: "no_refunds",
        province: null,
        department: null,
        delivery_mode: "PRESENCIAL",
        venue_map: mapA,
      },
      venue: {
        name: "Niceto",
        location: "Niceto",
        address: "Av. Córdoba 1234",
        city: "CABA",
        latitude: null,
        longitude: null,
        capacity: 200,
        max_capacity: 200,
        venue_map: null,
      },
      tickets: [],
      seatingMaps: [
        { event_date_id: dayA, map_config: mapA, pricing: {} },
        { event_date_id: dayB, map_config: mapB, pricing: {} },
      ],
    })
    assert.equal(draft.seatingMaps.length, 2)
    assert.equal(draft.seatingMaps[0]?.dateId, dayA)
    assert.equal(draft.seatingMaps[1]?.dateId, dayB)
    assert.equal(
      (draft.seatingMaps[1]?.mapConfig as { sectors: Array<{ id: string }> })
        .sectors[0]?.id,
      "sector-b",
    )
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

  it("does not resurrect a leftover map when the seating plan is off", () => {
    const draft = rehydrateEventDraftV2({
      event: {
        title: "After",
        date: "2026-09-01T22:00:00-03:00",
        ends_at: null,
        location: "CABA",
        description: null,
        flyer_url: null,
        image_url: null,
        social_share_image_url: null,
        visibility: "public",
        refund_policy: "organizer",
        province: null,
        department: null,
        delivery_mode: "PRESENCIAL",
        has_seating_plan: false,
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
        location: "CABA",
        address: "Av. Córdoba 1234",
        city: "CABA",
        latitude: null,
        longitude: null,
        capacity: 200,
        max_capacity: 200,
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
              seats: [],
            },
          ],
        },
      },
      tickets: [
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
      ],
    })
    assert.equal(draft.seatingMap.sectors.length, 0)
    assert.equal(draft.tickets[0]?.source, "general")
    assert.equal(draft.tickets[0]?.sectorId, "")
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

describe("overlayLivePurchaseCopyOnDraft", () => {
  it("fills refund and checkout copy when the draft never stored them", () => {
    const overlay = overlayLivePurchaseCopyOnDraft(
      emptyEventDraftV2(),
      {
        refundPolicy: "no_refunds",
        checkoutMessage: "Nos vemos en la puerta",
      },
      { basicInfo: { name: "After" } },
    )
    assert.equal(overlay.changed, true)
    assert.equal(overlay.draft.settings.refundPolicy, "no_refunds")
    assert.equal(overlay.draft.settings.checkoutMessage, "Nos vemos en la puerta")
  })

  it("fills the online access link when the draft never stored it", () => {
    const overlay = overlayLivePurchaseCopyOnDraft(
      {
        ...emptyEventDraftV2(),
        isVirtual: true,
        settings: {
          ...emptyEventDraftV2().settings,
          deliveryMode: "ONLINE",
        },
      },
      {
        accessLink: "https://meet.example/aula",
      },
      { basicInfo: { name: "Clase" } },
    )
    assert.equal(overlay.changed, true)
    assert.equal(overlay.draft.virtualLink, "https://meet.example/aula")
  })

  it("fills catalog visibility when the draft never stored isPublic", () => {
    const overlay = overlayLivePurchaseCopyOnDraft(
      {
        ...emptyEventDraftV2(),
        settings: {
          ...emptyEventDraftV2().settings,
          isPublic: true,
        },
      },
      {
        visibility: "private",
      },
      { basicInfo: { name: "After" } },
    )
    assert.equal(overlay.changed, true)
    assert.equal(overlay.draft.settings.isPublic, false)
  })

  it("keeps an explicit empty thank-you the organizer already saved", () => {
    const overlay = overlayLivePurchaseCopyOnDraft(
      {
        ...emptyEventDraftV2(),
        settings: {
          ...emptyEventDraftV2().settings,
          checkoutMessage: "",
          refundPolicy: "organizer",
        },
      },
      {
        refundPolicy: "until_24h",
        checkoutMessage: "Gracias",
      },
      {
        settings: {
          refundPolicy: "organizer",
          checkoutMessage: "",
        },
      },
    )
    assert.equal(overlay.changed, false)
    assert.equal(overlay.draft.settings.refundPolicy, "organizer")
    assert.equal(overlay.draft.settings.checkoutMessage, "")
  })
})
