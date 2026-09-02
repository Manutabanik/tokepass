import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  asPublishScheduleId,
  asPublishUuid,
  assertPublishedSeatedTicketsBoundToDays,
  buildPublishEventV2Payload,
  composePublishDescription,
  dayIdFromMapTicketId,
  draftDateToIso,
  formatEventPublishIssues,
  freePublishCapacity,
  isPublishScheduleForeignKeyError,
  publishedScheduleUpsertRows,
  resolvePublishedSaleWindowTierId,
  resolvePublishedTicketDayIds,
  sanitizePublishPayloadForDatabase,
  shouldPublishEventV2Sequentially,
} from "@/lib/events/publish-event-v2"
import { saleWindowToIso } from "@/lib/inventory/ticket-sale-window"
import { emptyEventDraftV2, eventPublishSchema } from "@/lib/validations/event-draft-v2"
import { draftLineItem, draftScheduleDay } from "@/tests/fixtures/event-draft-v2"

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
      draftLineItem({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "General",
        description: "Acceso",
        price: 10000,
        stock: 80,
        minOrder: 1,
        maxOrder: 6,
      }),
    ],
    extras: [
      draftLineItem({
        id: "item-extra",
        name: "Cerveza",
        price: 4000,
        stock: 50,
      }),
      draftLineItem({ id: "skip-me" }),
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
    assert.equal(payload.refund_policy, "no_refunds")
    assert.equal(payload.checkout_message, "Gracias por venir")
    assert.equal(payload.absorb_fees, true)
    assert.equal(payload.description, "After")
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
    assert.equal(payload.tickets[1]?.day_id, null)
    assert.equal(payload.tickets[1]?.id, null)
    assert.equal(payload.tickets[0]?.sale_starts_at, null)
    assert.equal(payload.tickets[0]?.sale_ends_at, null)
    assert.equal(payload.access_link, null)
    assert.match(payload.date, /^2026-09-0[12]T/)
    assert.deepEqual(payload.schedule_days, [])
  })

  it("binds extras to the jornada like generals", () => {
    const fridayId = "550e8400-e29b-41d4-a716-446655440001"
    const saturdayId = "550e8400-e29b-41d4-a716-446655440002"
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: fridayId,
        name: "Viernes",
        date: "2026-09-04",
        startDate: "2026-09-04T18:00",
        endDate: "2026-09-04T23:00",
        slots: [],
      },
      {
        id: saturdayId,
        name: "Sábado",
        date: "2026-09-05",
        startDate: "2026-09-05T18:00",
        endDate: "2026-09-05T23:00",
        slots: [],
      },
    ]
    draft.extras[0] = {
      ...draft.extras[0]!,
      slotId: fridayId,
      validDayIds: [fridayId],
    }
    const payload = buildPublishEventV2Payload(draft)
    const extra = payload.tickets.find((ticket) => ticket.ticket_type === "extra")
    assert.equal(extra?.day_id, fridayId)
    assert.equal(extra?.name, "Cerveza")
  })

  it("expands a visual extra with dayRates into one ticket_tiers row per jornada", () => {
    const fridayId = "550e8400-e29b-41d4-a716-446655440001"
    const saturdayId = "550e8400-e29b-41d4-a716-446655440002"
    const fridayExtraId = "550e8400-e29b-41d4-a716-446655440031"
    const saturdayExtraId = "550e8400-e29b-41d4-a716-446655440032"
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: fridayId,
        name: "Viernes",
        date: "2026-09-04",
        startDate: "2026-09-04T18:00",
        endDate: "2026-09-04T23:00",
        slots: [],
      },
      {
        id: saturdayId,
        name: "Sábado",
        date: "2026-09-05",
        startDate: "2026-09-05T18:00",
        endDate: "2026-09-05T23:00",
        slots: [],
      },
    ]
    draft.extras = [
      {
        ...draft.extras[0]!,
        id: fridayExtraId,
        name: "Estacionamiento",
        price: 5000,
        stock: 80,
        validDayIds: [],
        slotId: "",
        ticketType: "extra",
        dayRates: [
          { dayId: fridayId, price: 5000, stock: 40, ticketId: fridayExtraId },
          { dayId: saturdayId, price: 8000, stock: 40, ticketId: saturdayExtraId },
        ],
      },
    ]
    const payload = buildPublishEventV2Payload(draft)
    const extras = payload.tickets.filter((ticket) => ticket.ticket_type === "extra")
    assert.equal(extras.length, 2)
    assert.equal(extras[0]?.id, fridayExtraId)
    assert.equal(extras[0]?.day_id, fridayId)
    assert.equal(extras[0]?.price, 5000)
    assert.equal(extras[0]?.capacity, 40)
    assert.equal(extras[1]?.id, saturdayExtraId)
    assert.equal(extras[1]?.day_id, saturdayId)
    assert.equal(extras[1]?.price, 8000)
    assert.equal(extras[1]?.capacity, 40)
  })

  it("writes presale windows and the online access link", () => {
    const draft = publishableDraft()
    draft.isVirtual = true
    draft.virtualLink = "https://meet.example/clase"
    draft.tickets[0] = {
      ...draft.tickets[0]!,
      startDate: "2026-08-20T10:00",
      endDate: "2026-08-31T23:59",
    }
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.delivery_mode, "ONLINE")
    assert.equal(payload.access_link, "https://meet.example/clase")
    assert.equal(payload.tickets[0]?.sale_starts_at, saleWindowToIso("2026-08-20T10:00"))
    assert.equal(payload.tickets[0]?.sale_ends_at, saleWindowToIso("2026-08-31T23:59"))
  })

  it("treats the draft price as organizer net when fees are passed to the buyer", () => {
    const draft = publishableDraft()
    draft.settings.absorbFees = false
    draft.tickets[0]!.price = 15000
    const payload = buildPublishEventV2Payload(draft, {
      platformFeePercentage: 10,
      platformFixedFee: 0,
      maxFreeTickets: 100,
      isSponsoredByTokePass: false,
    })
    assert.equal(payload.tickets[0]?.base_price, 15000)
    assert.equal(payload.tickets[0]?.price, 15000)
    assert.equal(payload.tickets[0]?.platform_fee, 1500)
  })

  it("writes the first day to events.date and the rest to schedule_days", () => {
    const draft = publishableDraft()
    draft.schedule = [
      draftScheduleDay({
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Día 1",
        date: "2026-09-01",
        startDate: "2026-09-01T18:00",
        endDate: "2026-09-01T23:00",
      }),
      draftScheduleDay({
        id: "550e8400-e29b-41d4-a716-446655440002",
        name: "Función Noche",
        date: "2026-09-02",
        startDate: "2026-09-02T20:00",
        endDate: "2026-09-02T23:30",
      }),
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

  it("expands a visual general with dayRates into one ticket_tiers row per jornada", () => {
    const fridayId = "550e8400-e29b-41d4-a716-446655440001"
    const saturdayId = "550e8400-e29b-41d4-a716-446655440002"
    const fridayTicketId = "550e8400-e29b-41d4-a716-446655440021"
    const saturdayTicketId = "550e8400-e29b-41d4-a716-446655440022"
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: fridayId,
        name: "Viernes",
        date: "2026-09-04",
        startDate: "2026-09-04T18:00",
        endDate: "2026-09-04T23:00",
        slots: [],
      },
      {
        id: saturdayId,
        name: "Sábado",
        date: "2026-09-05",
        startDate: "2026-09-05T18:00",
        endDate: "2026-09-05T23:00",
        slots: [],
      },
    ]
    draft.tickets = [
      {
        ...draft.tickets[0]!,
        id: fridayTicketId,
        name: "General",
        price: 20000,
        stock: 130,
        validDayIds: [],
        slotId: "",
        dayRates: [
          { dayId: fridayId, price: 20000, stock: 80, ticketId: fridayTicketId },
          { dayId: saturdayId, price: 30000, stock: 50, ticketId: saturdayTicketId },
        ],
      },
    ]
    const payload = buildPublishEventV2Payload(draft)
    const generals = payload.tickets.filter((ticket) =>
      ticket.name.startsWith("General"),
    )
    assert.equal(generals.length, 2)
    assert.equal(generals[0]?.id, fridayTicketId)
    assert.equal(generals[0]?.day_id, fridayId)
    assert.equal(generals[0]?.price, 20000)
    assert.equal(generals[0]?.capacity, 80)
    assert.equal(generals[1]?.id, saturdayTicketId)
    assert.equal(generals[1]?.day_id, saturdayId)
    assert.equal(generals[1]?.price, 30000)
    assert.equal(generals[1]?.capacity, 50)
  })

  it("keeps general tickets off the seating map and skips nameless extras", () => {
    const draft = publishableDraft()
    draft.hasMap = true
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
    draft.hasMap = true
    draft.tickets.push(
      draftLineItem({
        id: "map-platea",
        name: "Platea",
        price: 18000,
        stock: 24,
        maxOrder: 4,
        source: "map",
        sectorId: "sector-platea",
        layoutType: "numbered_seat",
      }),
    )
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

  it("does not publish a seating plan when the organizer turned the map off", () => {
    const draft = publishableDraft()
    draft.hasMap = false
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
    assert.equal(payload.has_seating_plan, false)
    assert.equal(payload.seating_maps.length, 0)
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

  it("drops map tickets when the map is off", () => {
    const draft = publishableDraft()
    draft.tickets.push(
      draftLineItem({
        id: "map-platea",
        name: "Platea",
        price: 18000,
        stock: 24,
        maxOrder: 4,
        source: "map",
        sectorId: "sector-platea",
        layoutType: "numbered_seat",
      }),
    )
    const payload = buildPublishEventV2Payload(draft)
    assert.equal(payload.has_seating_plan, false)
    assert.equal(
      payload.tickets.some((ticket) => ticket.seating_sector_id === "sector-platea"),
      false,
    )
    assert.equal(
      payload.tickets.every((ticket) => ticket.seating_sector_id == null),
      true,
    )
    const leftoverMap = payload.tickets.find((ticket) => ticket.name === "Platea")
    assert.equal(leftoverMap?.tier_type, "general")
    assert.equal(leftoverMap?.layout_type, "general")
  })

  it("drops orphan map tickets that are no longer in the venue map", () => {
    const draft = publishableDraft()
    draft.tickets.push(
      draftLineItem({
        id: "map-gone",
        name: "Viejo",
        price: 12000,
        stock: 10,
        maxOrder: 4,
        source: "map",
        sectorId: "sector-borrado",
        layoutType: "numbered_seat",
      }),
    )
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
    assert.equal(
      payload.tickets.some((ticket) => ticket.name === "Viejo"),
      false,
    )
    assert.equal(
      payload.tickets.some((ticket) => ticket.seating_sector_id === "sector-borrado"),
      false,
    )
  })

  it("heals a map ticket whose seating_sector_id changed but the name still matches", () => {
    const draft = publishableDraft()
    draft.hasMap = true
    draft.tickets.push(
      draftLineItem({
        id: "map-platea",
        name: "Platea",
        price: 18000,
        stock: 24,
        maxOrder: 4,
        source: "map",
        sectorId: "sec-viejo",
        layoutType: "numbered_seat",
      }),
    )
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
    const platea = payload.tickets.find((ticket) => ticket.name === "Platea")
    assert.equal(platea?.seating_sector_id, "sector-platea")
    assert.equal(platea?.tier_type, "seated")
  })

  it("allows two day-bound map tickets to share the same seating_sector_id", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const draft = publishableDraft()
    draft.hasMap = true
    draft.schedule = [
      {
        id: dayA,
        name: "Viernes",
        date: "2026-09-04",
        startDate: "2026-09-04T18:00",
        endDate: "2026-09-04T23:00",
        slots: [],
      },
      {
        id: dayB,
        name: "Sábado",
        date: "2026-09-05",
        startDate: "2026-09-05T18:00",
        endDate: "2026-09-05T23:00",
        slots: [],
      },
    ]
    draft.tickets.push(
      draftLineItem({
        id: "map-viernes",
        name: "Grada Naranja",
        price: 15000,
        stock: 40,
        maxOrder: 4,
        source: "map",
        sectorId: "sector-grada",
        layoutType: "numbered_seat",
        validDayIds: [dayA],
      }),
      draftLineItem({
        id: "map-sabado",
        name: "Grada Naranja",
        price: 15000,
        stock: 40,
        maxOrder: 4,
        source: "map",
        sectorId: "sector-grada",
        layoutType: "numbered_seat",
        validDayIds: [dayB],
      }),
    )
    draft.seatingMap = {
      ...draft.seatingMap,
      version: 1,
      url: "",
      sectors: [
        {
          id: "sector-grada",
          name: "Grada Naranja",
          color: "#f97316",
          price: 15000,
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
    const mapTickets = payload.tickets.filter(
      (ticket) => ticket.seating_sector_id === "sector-grada",
    )
    assert.equal(mapTickets.length, 2)
    assert.deepEqual(
      mapTickets.map((ticket) => ticket.day_id).sort(),
      [dayA, dayB],
    )
  })

  it("recovers the jornada from map:{date}:{sector} when validDayIds is missing", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    assert.equal(dayIdFromMapTicketId(`map:${dayA}:grada-naranja`), dayA)
    const draft = publishableDraft()
    draft.hasMap = true
    const gradaMap = {
      version: 1,
      url: "",
      sectors: [
        {
          id: "grada-naranja",
          name: "Grada Naranja",
          color: "#f97316",
          price: 40000,
          x: 0,
          y: 0,
          rows: 1,
          seatsPerRow: 1,
          curvature: 0,
          aisle: false,
          seats: [
            { id: "grada-naranja-r1-n1", row: "1", number: 1, x: 0, y: 0, status: "available" },
          ],
        },
      ],
    }
    draft.seatingMaps = [
      { dateId: dayA, mapConfig: gradaMap, pricing: {} },
      { dateId: dayB, mapConfig: gradaMap, pricing: {} },
    ]
    draft.schedule = [
      {
        id: dayA,
        name: "Viernes",
        date: "2026-11-13",
        startDate: "2026-11-13T18:00",
        endDate: "2026-11-13T23:00",
        slots: [],
      },
      {
        id: dayB,
        name: "Sábado",
        date: "2026-11-14",
        startDate: "2026-11-14T18:00",
        endDate: "2026-11-14T23:00",
        slots: [],
      },
    ]
    draft.tickets = [
      draftLineItem({
        id: `map:${dayA}:grada-naranja`,
        name: "Grada Naranja",
        price: 40000,
        stock: 27,
        maxOrder: 4,
        source: "map",
        sectorId: "grada-naranja",
        layoutType: "table_combo",
      }),
      draftLineItem({
        id: `map:${dayB}:grada-naranja`,
        name: "Grada Naranja",
        price: 70000,
        stock: 27,
        maxOrder: 4,
        source: "map",
        sectorId: "grada-naranja",
        layoutType: "table_combo",
      }),
    ]
    const payload = buildPublishEventV2Payload(draft)
    const mapTickets = payload.tickets.filter(
      (ticket) => ticket.seating_sector_id === "grada-naranja",
    )
    assert.equal(mapTickets.length, 2)
    assert.deepEqual(
      mapTickets.map((ticket) => ticket.day_id).sort(),
      [dayA, dayB],
    )
  })

  it("refuses a multi-day map ticket without a jornada", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const draft = publishableDraft()
    draft.hasMap = true
    draft.schedule = [
      {
        id: dayA,
        name: "Viernes",
        date: "2026-11-13",
        startDate: "2026-11-13T18:00",
        endDate: "2026-11-13T23:00",
        slots: [],
      },
      {
        id: dayB,
        name: "Sábado",
        date: "2026-11-14",
        startDate: "2026-11-14T18:00",
        endDate: "2026-11-14T23:00",
        slots: [],
      },
    ]
    draft.seatingMap = {
      version: 1,
      url: "",
      sectors: [
        {
          id: "grada-naranja",
          name: "Grada Naranja",
          color: "#f97316",
          price: 40000,
          x: 0,
          y: 0,
          rows: 1,
          seatsPerRow: 1,
          curvature: 0,
          aisle: false,
          seats: [
            { id: "grada-naranja-r1-n1", row: "1", number: 1, x: 0, y: 0, status: "available" },
          ],
        },
      ],
    }
    draft.tickets.push(
      draftLineItem({
        id: "map-huérfano",
        name: "Grada Naranja",
        price: 40000,
        stock: 27,
        maxOrder: 4,
        source: "map",
        sectorId: "grada-naranja",
        layoutType: "table_combo",
      }),
    )
    assert.throws(
      () => buildPublishEventV2Payload(draft),
      /atada a un día/,
    )
  })

  it("keeps the same sector on two days without treating it as a collision", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    assert.doesNotThrow(() =>
      assertPublishedSeatedTicketsBoundToDays(
        [
          {
            seating_sector_id: "grada-naranja",
            layout_type: "table_combo",
            day_id: dayA,
          },
          {
            seating_sector_id: "grada-naranja",
            layout_type: "table_combo",
            day_id: dayB,
          },
        ],
        [{ id: dayA }, { id: dayB }],
      ),
    )
    assert.deepEqual(
      resolvePublishedTicketDayIds(
        { id: `map:${dayA}:grada-naranja` },
        new Set([dayA, dayB]),
        [
          {
            id: dayA,
            dayId: dayA,
            title: "Día 1",
            date: "2026-11-13",
            startDateTime: "2026-11-13T18:00",
            endDateTime: "2026-11-13T23:00",
          },
          {
            id: dayB,
            dayId: dayB,
            title: "Día 2",
            date: "2026-11-14",
            startDateTime: "2026-11-14T18:00",
            endDateTime: "2026-11-14T23:00",
          },
        ],
      ),
      [dayA],
    )
  })

  it("writes Friday and Saturday map tickets without a null day_id window", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const rows = publishedScheduleUpsertRows("event-1", [
      {
        id: dayA,
        title: "Viernes",
        start_time: "2026-11-13T18:00:00",
        end_time: "2026-11-13T23:00:00",
      },
      {
        id: dayB,
        title: "Sábado",
        start_time: "2026-11-14T18:00:00",
        end_time: "2026-11-14T23:00:00",
      },
    ])
    assert.deepEqual(
      rows.map((row) => row.id),
      [dayA, dayB],
    )
    assert.equal(
      shouldPublishEventV2Sequentially({
        schedule_days: [
          { id: dayA, title: "Viernes", start_time: "", end_time: "" },
          { id: dayB, title: "Sábado", start_time: "", end_time: "" },
        ],
      }),
      true,
    )
    assert.equal(
      shouldPublishEventV2Sequentially({
        schedule_days: [],
      }),
      false,
    )
    assert.doesNotThrow(() =>
      assertPublishedSeatedTicketsBoundToDays(
        [
          {
            seating_sector_id: "grada-naranja",
            layout_type: "table_combo",
            day_id: dayA,
          },
          {
            seating_sector_id: "grada-amarilla",
            layout_type: "table_combo",
            day_id: dayA,
          },
          {
            seating_sector_id: "grada-naranja",
            layout_type: "table_combo",
            day_id: dayB,
          },
          {
            seating_sector_id: "grada-amarilla",
            layout_type: "table_combo",
            day_id: dayB,
          },
        ],
        [{ id: dayA }, { id: dayB }],
      ),
    )
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
    assert.equal(payload.refund_policy, "organizer")
    assert.equal(payload.checkout_message, "Gracias por venir")
    assert.equal(payload.description, "After")
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

  it("binds a ticket to a non-uuid draft slot with a stable schedule id", () => {
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: "day-a",
        name: "Sábado",
        date: "2026-09-05",
        startDate: "",
        endDate: "",
        slots: [
          { id: "slot-manana", startTime: "10:00", endTime: "12:00" },
          { id: "slot-tarde", startTime: "14:00", endTime: "16:00" },
        ],
      },
    ]
    draft.tickets[0]!.slotId = "slot-manana"
    const payload = buildPublishEventV2Payload(draft)
    const morningId = asPublishScheduleId("slot-manana")
    assert.equal(payload.schedule_days.length, 2)
    assert.equal(payload.schedule_days[0]?.id, morningId)
    assert.equal(payload.tickets[0]?.day_id, morningId)
    assert.equal(buildPublishEventV2Payload(draft).schedule_days[0]?.id, morningId)
  })

  it("converts datetime-local values to ISO", () => {
    const iso = draftDateToIso("2026-09-01T22:00")
    assert.equal(Number.isNaN(Date.parse(iso)), false)
  })

  it("publishes one seating_maps row per day instance", () => {
    const draft = publishableDraft()
    draft.hasMap = true
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
    draft.hasMap = true
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

  it("publishes one ticket per slot when a day chip covers several turnos", () => {
    const draft = publishableDraft()
    const dayId = "550e8400-e29b-41d4-a716-446655440010"
    const slotA = "550e8400-e29b-41d4-a716-446655440011"
    const slotB = "550e8400-e29b-41d4-a716-446655440012"
    draft.schedule = [
      {
        id: dayId,
        name: "Sábado",
        date: "2026-09-05",
        startDate: "2026-09-05T10:00",
        endDate: "2026-09-05T18:00",
        slots: [
          { id: slotA, startTime: "10:00", endTime: "12:00" },
          { id: slotB, startTime: "14:00", endTime: "18:00" },
        ],
      },
    ]
    draft.tickets[0]!.validDayIds = [dayId]
    const payload = buildPublishEventV2Payload(draft)
    const named = payload.tickets.filter((ticket) => ticket.name === "General")
    assert.equal(named.length, 2)
    assert.deepEqual(
      named.map((ticket) => ticket.day_id).sort(),
      [slotA, slotB].sort(),
    )
  })

  it("does not count paid tickets as free capacity", () => {
    const payload = buildPublishEventV2Payload(publishableDraft())
    assert.equal(freePublishCapacity(payload), 0)
  })

  it("keeps live numbered sectors and rejects ghost mesa/asiento sectors", () => {
    const base = {
      ...buildPublishEventV2Payload(publishableDraft()),
      has_seating_plan: true,
      venue_map: {
        version: 1,
        sectors: [
          {
            id: "grada-naranja",
            name: "Grada Naranja",
            color: "#f97316",
            price: 0,
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
    }
    const live = sanitizePublishPayloadForDatabase({
      ...base,
      tickets: [
        {
          id: null,
          name: "Viva",
          description: null,
          price: 10000,
          base_price: 10000,
          platform_fee: 0,
          capacity: 10,
          min_purchase_limit: 1,
          max_purchase_limit: 4,
          tier_type: "seated",
          category: "standard",
          layout_type: "numbered_seat",
          seating_sector_id: "grada-naranja",
          day_id: null,
          ticket_type: "standard",
        },
      ],
    })
    assert.equal(
      live.tickets.find((ticket) => ticket.name === "Viva")?.seating_sector_id,
      "grada-naranja",
    )
    assert.throws(
      () =>
        sanitizePublishPayloadForDatabase({
          ...base,
          tickets: [
            {
              id: null,
              name: "Fantasma",
              description: null,
              price: 8000,
              base_price: 8000,
              platform_fee: 0,
              capacity: 10,
              min_purchase_limit: 1,
              max_purchase_limit: 4,
              tier_type: "seated",
              category: "standard",
              layout_type: "numbered_seat",
              seating_sector_id: "grada-borrada",
              day_id: null,
              ticket_type: "standard",
            },
          ],
        }),
      /Fantasma/,
    )
  })

  it("keeps the public about as the title, never the thank-you note", () => {
    assert.equal(
      composePublishDescription({ title: "After" }),
      "After",
    )
    assert.equal(
      composePublishDescription({
        title: "After",
        checkoutMessage: "Gracias por venir",
      }),
      "After",
    )
  })

  it("patches sale windows only when the live row is unique", () => {
    const known = "550e8400-e29b-41d4-a716-446655440000"
    assert.equal(
      resolvePublishedSaleWindowTierId({ id: known }, [
        { id: "550e8400-e29b-41d4-a716-446655440099" },
      ]),
      known,
    )
    assert.equal(
      resolvePublishedSaleWindowTierId({ id: null }, [{ id: known }]),
      known,
    )
    assert.equal(
      resolvePublishedSaleWindowTierId({ id: null }, [
        { id: known },
        { id: "550e8400-e29b-41d4-a716-446655440099" },
      ]),
      null,
    )
  })

  it("keeps a combo as one SKU covering every selected jornada", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: dayA,
        name: "Viernes",
        date: "2026-11-13",
        startDate: "2026-11-13T18:00",
        endDate: "2026-11-13T23:00",
        slots: [],
      },
      {
        id: dayB,
        name: "Sábado",
        date: "2026-11-14",
        startDate: "2026-11-14T18:00",
        endDate: "2026-11-14T23:00",
        slots: [],
      },
    ]
    draft.tickets = [
      draftLineItem({
        id: "550e8400-e29b-41d4-a716-446655440099",
        name: "Pack 2 días",
        price: 25000,
        stock: 40,
        maxOrder: 4,
        ticketType: "combo",
        validDayIds: [dayA, dayB],
      }),
    ]
    const payload = buildPublishEventV2Payload(draft)
    const combos = payload.tickets.filter((ticket) => ticket.ticket_type === "combo")
    assert.equal(combos.length, 1)
    assert.equal(combos[0]?.day_id, null)
    assert.deepEqual(combos[0]?.combo_schedule_ids, [dayA, dayB])
  })
})
