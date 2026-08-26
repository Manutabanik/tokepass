import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  asPublishUuid,
  buildPublishEventV2Payload,
  composePublishDescription,
  draftDateToIso,
  formatEventPublishIssues,
  freePublishCapacity,
  isPublishScheduleForeignKeyError,
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
    promoVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    galleryUrls: ["https://cdn.example/exp-1.jpg"],
    restrictions: "+18. DNI en puerta.",
    whatToBring: "Llevá DNI. No se permiten mochilas grandes.",
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
    assert.equal("refund_policy" in payload, false)
    assert.equal(payload.description, "Gracias por venir")
    assert.equal(payload.promo_video_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert.deepEqual(payload.gallery_urls, ["https://cdn.example/exp-1.jpg"])
    assert.equal(payload.restrictions, "+18. DNI en puerta.")
    assert.equal(payload.what_to_bring, "Llevá DNI. No se permiten mochilas grandes.")
    assert.equal(payload.flyer_url, "https://cdn.example/flyer.jpg")
    assert.equal(payload.social_share_image_url, "https://cdn.example/banner.jpg")
    assert.equal(payload.venue.capacity, 200)
    assert.equal(payload.tickets.length, 2)
    assert.equal(payload.tickets[0]?.id, "550e8400-e29b-41d4-a716-446655440000")
    assert.equal(payload.tickets[0]?.tier_type, "general")
    assert.equal(payload.tickets[0]?.ticket_type, "standard")
    assert.equal(payload.tickets[0]?.category, "standard")
    assert.equal(payload.tickets[0]?.layout_type, "general")
    assert.equal(payload.tickets[0]?.seating_sector_id, null)
    assert.equal(payload.has_seating_plan, false)
    assert.equal(payload.tickets[0]?.price, 10000)
    assert.ok((payload.tickets[0]?.base_price ?? 0) < 10000)
    assert.equal(payload.tickets[1]?.tier_type, "addon")
    assert.equal(payload.tickets[1]?.ticket_type, "extra")
    assert.equal(payload.tickets[1]?.category, "special")
    assert.equal(payload.tickets[1]?.id, null)
    assert.match(payload.date, /^2026-09-0[12]T/)
    assert.deepEqual(payload.schedule_days, [])
  })

  it("writes the first day to events.date and the rest to schedule_days", () => {
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Día 1",
        startDate: "2026-09-01T18:00",
        endDate: "2026-09-01T23:00",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        name: "Función Noche",
        startDate: "2026-09-02T20:00",
        endDate: "2026-09-02T23:30",
      },
    ]
    const payload = buildPublishEventV2Payload(draft)
    assert.match(payload.date, /^2026-09-0[12]T/)
    assert.match(payload.ends_at ?? "", /^2026-09-0[23]T/)
    assert.equal(payload.schedule_days.length, 2)
    assert.equal(payload.schedule_days[0]?.id, "550e8400-e29b-41d4-a716-446655440001")
    assert.equal(payload.schedule_days[0]?.title, "Día 1")
    assert.equal(payload.schedule_days[1]?.title, "Función Noche")
    assert.match(payload.schedule_days[0]?.start_time ?? "", /^2026-09-0[12]T/)
    assert.match(payload.schedule_days[1]?.end_time ?? "", /^2026-09-0[23]T/)
  })

  it("expands date slots into schedule_days and binds the ticket day_id", () => {
    const draft = publishableDraft()
    draft.archetype = "experience"
    draft.schedule = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Sábado de Cabalgata",
        date: "2026-09-05",
        startDate: "",
        endDate: "",
        slots: [
          {
            id: "550e8400-e29b-41d4-a716-446655440011",
            startTime: "10:00",
            endTime: "12:00",
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440012",
            startTime: "14:00",
            endTime: "16:00",
          },
        ],
      },
    ]
    draft.tickets[0]!.slotId = "550e8400-e29b-41d4-a716-446655440011"
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.schedule_days.length, 2)
    assert.equal(
      payload.schedule_days[0]?.id,
      "550e8400-e29b-41d4-a716-446655440011",
    )
    assert.equal(payload.schedule_days[0]?.title, "Sábado de Cabalgata")
    assert.equal(payload.tickets[0]?.day_id, "550e8400-e29b-41d4-a716-446655440011")
    assert.match(payload.date, /^2026-09-05T/)
  })

  it("binds a daily pass from validDayIds and leaves abonos unbound", () => {
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Día 1",
        date: "2026-09-04",
        startDate: "2026-09-04T18:00",
        endDate: "2026-09-04T23:00",
        slots: [],
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        name: "Día 2",
        date: "2026-09-05",
        startDate: "2026-09-05T18:00",
        endDate: "2026-09-05T23:00",
        slots: [],
      },
    ]
    draft.tickets = [
      {
        ...draft.tickets[0]!,
        id: "t-daily",
        name: "Pase viernes",
        validDayIds: ["550e8400-e29b-41d4-a716-446655440001"],
      },
      {
        ...draft.tickets[0]!,
        id: "t-pass",
        name: "Abono",
        validDayIds: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
      },
    ]
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(
      payload.tickets[0]?.day_id,
      "550e8400-e29b-41d4-a716-446655440001",
    )
    assert.equal(payload.tickets[1]?.day_id, null)
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

  it("nulls leftover seating_sector_id on general tickets", () => {
    const draft = publishableDraft()
    draft.tickets[0] = {
      ...draft.tickets[0]!,
      source: "general",
      sectorId: "sector-borrado",
      layoutType: "general",
    }
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
    assert.equal(payload.tickets[0]?.tier_type, "general")
    assert.equal(payload.tickets[0]?.seating_sector_id, null)
  })

  it("nulls seating_sector_id when the map is off", () => {
    const draft = publishableDraft()
    draft.tickets[0] = {
      ...draft.tickets[0]!,
      source: "map",
      sectorId: "sector-platea",
      layoutType: "numbered_seat",
    }
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.has_seating_plan, false)
    assert.equal(payload.tickets[0]?.seating_sector_id, null)
    assert.equal(payload.tickets[0]?.tier_type, "general")
  })

  it("nulls orphan map sectors that are no longer in the venue map", () => {
    const draft = publishableDraft()
    draft.tickets.push({
      id: "map-gone",
      name: "Viejo",
      description: "",
      price: 12000,
      stock: 10,
      minOrder: 1,
      maxOrder: 4,
      source: "map",
      sectorId: "sector-borrado",
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
    const orphan = payload.tickets.find((ticket) => ticket.name === "Viejo")
    assert.equal(orphan?.seating_sector_id, null)
    assert.equal(orphan?.tier_type, "general")
  })

  it("lists the event in the public catalog unless the organizer opts out", () => {
    const listed = buildPublishEventV2Payload({
      ...publishableDraft(),
      settings: { ...publishableDraft().settings, isPublic: undefined },
    })
    assert.equal(listed.visibility, "public")
    const draft = publishableDraft()
    draft.settings.isPublic = false
    draft.settings.refundPolicy = "Reintegro a criterio"
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.visibility, "private")
    assert.equal("refund_policy" in payload, false)
    assert.equal(payload.description, "Gracias por venir")
    assert.equal(payload.description.includes("Reintegro"), false)
  })
})

describe("publish helpers", () => {
  it("detects the event_schedules foreign-key block as a recoverable RPC error", () => {
    assert.equal(
      isPublishScheduleForeignKeyError({
        code: "23503",
        message: "No se puede eliminar una jornada con tickets asociados: Día 1, Día 2.",
      }),
      true,
    )
    assert.equal(
      isPublishScheduleForeignKeyError({
        code: "23503",
        message: "insert or update on table ticket_tiers violates foreign key",
        details: "ticket_tiers_day_id_fkey",
      }),
      true,
    )
    assert.equal(
      isPublishScheduleForeignKeyError({
        code: "23503",
        message: "insert or update on table venues violates foreign key",
      }),
      false,
    )
  })

  it("accepts only real UUIDs as ticket ids", () => {
    assert.equal(asPublishUuid("t1"), null)
    assert.equal(asPublishUuid("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000")
  })

  it("converts datetime-local values to ISO", () => {
    const iso = draftDateToIso("2026-09-01T22:00")
    assert.equal(Number.isNaN(Date.parse(iso)), false)
  })

  it("publishes one seating_maps row per day instance", () => {
    const draft = publishableDraft()
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    draft.schedule = [
      {
        id: dayA,
        name: "Día 1",
        date: "2026-09-01",
        startDate: "2026-09-01T22:00",
        endDate: "2026-09-02T04:00",
        slots: [],
      },
      {
        id: dayB,
        name: "Día 2",
        date: "2026-09-02",
        startDate: "2026-09-02T22:00",
        endDate: "2026-09-03T04:00",
        slots: [],
      },
    ]
    draft.seatingMaps = [
      {
        dateId: dayA,
        mapConfig: {
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
              ],
            },
          ],
        },
        pricing: { sectorPrices: { "sector-platea": 18000 }, blockedSeatIds: [] },
      },
      {
        dateId: dayB,
        mapConfig: {
          version: 1,
          url: "",
          sectors: [
            {
              id: "sector-vip",
              name: "VIP",
              color: "#22c55e",
              price: 24000,
              x: 0,
              y: 0,
              rows: 1,
              seatsPerRow: 1,
              curvature: 0,
              aisle: false,
              seats: [
                { id: "v1", row: "1", number: 1, x: 0, y: 0, status: "available" },
              ],
            },
          ],
        },
        pricing: { sectorPrices: { "sector-vip": 24000 }, blockedSeatIds: [] },
      },
    ]
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.has_seating_plan, true)
    assert.equal(payload.seating_maps.length, 2)
    assert.equal(payload.seating_maps[0]?.event_date_id, dayA)
    assert.equal(payload.seating_maps[1]?.event_date_id, dayB)
  })

  it("expands a day map onto each published slot occurrence", () => {
    const draft = publishableDraft()
    const dayId = "550e8400-e29b-41d4-a716-446655440010"
    const slotA = "550e8400-e29b-41d4-a716-446655440011"
    const slotB = "550e8400-e29b-41d4-a716-446655440012"
    draft.schedule = [
      {
        id: dayId,
        name: "Día 1",
        date: "2026-09-01",
        startDate: "2026-09-01T18:00",
        endDate: "2026-09-01T23:00",
        slots: [
          { id: slotA, startTime: "18:00", endTime: "20:00" },
          { id: slotB, startTime: "21:00", endTime: "23:00" },
        ],
      },
    ]
    draft.seatingMaps = [
      {
        dateId: dayId,
        mapConfig: {
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
              seatsPerRow: 1,
              curvature: 0,
              aisle: false,
              seats: [
                { id: "s1", row: "1", number: 1, x: 0, y: 0, status: "available" },
              ],
            },
          ],
        },
        pricing: { sectorPrices: { "sector-platea": 18000 }, blockedSeatIds: [] },
      },
    ]
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.seating_maps.length, 2)
    assert.equal(payload.seating_maps[0]?.event_date_id, slotA)
    assert.equal(payload.seating_maps[1]?.event_date_id, slotB)
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
