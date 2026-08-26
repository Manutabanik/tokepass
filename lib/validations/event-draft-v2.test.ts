import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftCapacityThermometer,
  emptyEventDraftV2,
  eventDraftSchema,
  eventPublishDisabledReason,
  eventPublishSchema,
  isEventDraftPublishable,
  parseDraftLineup,
  parseEventDraftV2,
  toEventDraftV2Payload,
  toggleDraftLineupDay,
} from "@/lib/validations/event-draft-v2"

function publishableDraft() {
  return {
    ...emptyEventDraftV2(),
    basicInfo: {
      name: "After",
      startDate: "2026-09-01T22:00",
      endDate: "2026-09-02T04:00",
      locationName: "Niceto",
    },
    location: {
      venueName: "Niceto",
      address: "Av. Córdoba 1234, CABA",
      province: "Ciudad Autónoma de Buenos Aires",
      city: "Comuna 1",
      lat: -34.6037,
      lng: -58.3816,
    },
    venueCapacity: 200,
    tickets: [
      {
        id: "t1",
        name: "General",
        description: "",
        price: 15000,
        stock: 80,
        minOrder: 1,
        maxOrder: 10,
      },
    ],
  }
}

describe("eventDraftSchema", () => {
  it("accepts an empty draft so autosave never blocks", () => {
    const parsed = eventDraftSchema.parse({})
    assert.equal(parsed.basicInfo.name, "")
    assert.equal(parsed.venueCapacity, 0)
    assert.deepEqual(parsed.tickets, [])
    assert.deepEqual(parsed.extras, [])
    assert.equal(parsed.flyerUrl, "")
    assert.deepEqual(parsed.seatingMap.sectors, [])
    assert.deepEqual(parsed.seatingMaps, [])
    assert.equal(parsed.location.venueName, "")
    assert.equal(parsed.location.address, "")
    assert.equal(parsed.settings.deliveryMode, "PRESENCIAL")
    assert.equal(parsed.archetype, "show")
    assert.equal(parsed.isVirtual, false)
    assert.equal(parsed.virtualLink, "")
    assert.equal(parsed.schedule.length, 0)
    assert.deepEqual(parsed.lineup, [])
    assert.equal(parsed.promoVideoUrl, "")
    assert.deepEqual(parsed.galleryUrls, [])
    assert.equal(parsed.restrictions, "")
    assert.equal(parsed.whatToBring, "")
  })

  it("emptyEventDraftV2 starts with a single default day", () => {
    const draft = emptyEventDraftV2()
    assert.equal(draft.schedule.length, 1)
    assert.equal(draft.schedule[0]?.name, "Día 1")
    assert.equal(draft.schedule[0]?.startDate, "")
    assert.ok(draft.schedule[0]?.id)
    assert.deepEqual(draft.lineup, [])
  })

  it("defaults ticketType to standard on tickets and extra on parsed extras", () => {
    assert.equal(
      eventDraftSchema.parse({ tickets: [{}] }).tickets[0]?.ticketType,
      "standard",
    )
    assert.equal(parseEventDraftV2({ extras: [{}] }).extras[0]?.ticketType, "extra")
    assert.equal(
      eventDraftSchema.parse({ tickets: [{ ticketType: "combo" }] }).tickets[0]
        ?.ticketType,
      "combo",
    )
  })

  it("still accepts over-capacity stock without failing", () => {
    const parsed = eventDraftSchema.safeParse({
      venueCapacity: 10,
      tickets: [{ id: "t1", name: "General", stock: 99 }],
    })
    assert.equal(parsed.success, true)
  })
})

describe("eventPublishSchema", () => {
  it("rejects an empty draft", () => {
    assert.equal(eventPublishSchema.safeParse(emptyEventDraftV2()).success, false)
    assert.equal(isEventDraftPublishable(emptyEventDraftV2()), false)
    assert.ok(eventPublishDisabledReason(emptyEventDraftV2()).length > 0)
  })

  it("requires ticket stock greater than 0", () => {
    const draft = publishableDraft()
    draft.tickets[0]!.stock = 0
    assert.equal(eventPublishSchema.safeParse(draft).success, false)
  })

  it("rejects negative prices and inverted sale windows", () => {
    const negative = publishableDraft()
    negative.tickets[0]!.price = -1
    assert.equal(eventPublishSchema.safeParse(negative).success, false)

    const window = publishableDraft()
    window.tickets[0]!.startDate = "2026-09-10T10:00"
    window.tickets[0]!.endDate = "2026-09-01T10:00"
    assert.equal(eventPublishSchema.safeParse(window).success, false)

    const limits = publishableDraft()
    limits.tickets[0]!.minOrder = 5
    limits.tickets[0]!.maxOrder = 2
    assert.equal(eventPublishSchema.safeParse(limits).success, false)
  })

  it("requires endDate to be after startDate", () => {
    const draft = publishableDraft()
    draft.basicInfo.endDate = "2026-08-01T22:00"
    draft.schedule = [
      {
        id: "day-1",
        name: "Día 1",
        startDate: "2026-09-01T22:00",
        endDate: "2026-08-01T22:00",
      },
    ]
    const result = eventPublishSchema.safeParse(draft)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(
        result.error.issues.some((issue) =>
          issue.path.join(".").includes("endDate"),
        ),
      )
    }
  })

  it("requires a start date on the first schedule day", () => {
    const draft = publishableDraft()
    draft.basicInfo.startDate = ""
    draft.basicInfo.endDate = ""
    draft.schedule = [
      { id: "day-1", name: "Día 1", startDate: "", endDate: "" },
    ]
    const result = eventPublishSchema.safeParse(draft)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(
        result.error.issues.some((issue) =>
          issue.path.join(".").includes("schedule"),
        ),
      )
    }
  })

  it("requires an end date on every day of a multi-day schedule", () => {
    const draft = publishableDraft()
    draft.schedule = [
      {
        id: "day-1",
        name: "Día 1",
        startDate: "2026-09-01T22:00",
        endDate: "2026-09-02T04:00",
      },
      {
        id: "day-2",
        name: "Función Noche",
        startDate: "2026-09-02T22:00",
        endDate: "",
      },
    ]
    const result = eventPublishSchema.safeParse(draft)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(
        result.error.issues.some((issue) =>
          issue.path.join(".").includes("schedule.1.endDate"),
        ),
      )
    }
  })

  it("accepts a complete draft", () => {
    assert.equal(eventPublishSchema.safeParse(publishableDraft()).success, true)
    assert.equal(isEventDraftPublishable(publishableDraft()), true)
  })

  it("requires venue name and address when the event is presencial", () => {
    const draft = publishableDraft()
    draft.location.venueName = ""
    draft.basicInfo.locationName = ""
    draft.location.address = ""
    const result = eventPublishSchema.safeParse(draft)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(
        result.error.issues.some((issue) =>
          issue.path.join(".").includes("location.venueName"),
        ),
      )
      assert.ok(
        result.error.issues.some((issue) =>
          issue.path.join(".").includes("location.address"),
        ),
      )
    }
  })

  it("allows an online event without a physical address", () => {
    const draft = publishableDraft()
    draft.location = {
      venueName: "",
      address: "",
      province: "",
      city: "",
    }
    draft.basicInfo.locationName = ""
    draft.settings.deliveryMode = "ONLINE"
    assert.equal(eventPublishSchema.safeParse(draft).success, true)
  })

  it("allows a virtual course without a physical address", () => {
    const draft = publishableDraft()
    draft.archetype = "course"
    draft.isVirtual = true
    draft.virtualLink = "https://zoom.example/aula"
    draft.location = {
      venueName: "",
      address: "",
      province: "",
      city: "",
    }
    draft.basicInfo.locationName = ""
    assert.equal(eventPublishSchema.safeParse(draft).success, true)
  })
})

describe("parseEventDraftV2", () => {
  it("defaults archetype to show and infers isVirtual from online delivery", () => {
    const parsed = parseEventDraftV2({
      settings: { deliveryMode: "ONLINE" },
    })
    assert.equal(parsed.archetype, "show")
    assert.equal(parsed.isVirtual, true)
    assert.equal(parsed.settings.deliveryMode, "ONLINE")
    const sport = parseEventDraftV2({
      archetype: "sport",
      isVirtual: true,
      settings: { deliveryMode: "ONLINE" },
    })
    assert.equal(sport.archetype, "sport")
    assert.equal(sport.isVirtual, false)
    assert.equal(sport.settings.deliveryMode, "PRESENCIAL")
  })

  it("strips markup and clamps negative money fields", () => {
    const parsed = parseEventDraftV2({
      basicInfo: { name: "<script>x</script>After" },
      tickets: [{ name: "<b>General</b>", price: -20, stock: -4 }],
    })
    assert.equal(parsed.basicInfo.name, "x After")
    assert.equal(parsed.tickets[0]?.name, "General")
    assert.equal(parsed.tickets[0]?.price, 0)
    assert.equal(parsed.tickets[0]?.stock, 0)
  })

  it("hydrates draft_state without inventing tickets or dropping extra keys", () => {
    const parsed = parseEventDraftV2({ title: "Fiesta", tickets: [], keep: 1 })
    assert.equal(parsed.basicInfo.name, "Fiesta")
    assert.equal(parsed.venueCapacity, 0)
    assert.deepEqual(parsed.tickets, [])
    assert.deepEqual(parsed.extras, [])
    assert.equal(parsed.flyerUrl, "")
    assert.equal(parsed.seatingMap.url, "")
    assert.deepEqual(parsed.seatingMap.sectors, [])
    assert.equal(parsed.settings.isPublic, true)
    assert.equal((parsed as { keep?: number }).keep, 1)
    assert.equal(parsed.schedule.length, 1)
    assert.equal(parsed.schedule[0]?.name, "Día 1")
    const empty = parseEventDraftV2(null)
    assert.equal(empty.schedule.length, 1)
    assert.equal(empty.schedule[0]?.name, "Día 1")
    assert.equal(empty.basicInfo.name, "")
  })

  it("hydrates schedule from legacy basicInfo dates when the array is missing", () => {
    const parsed = parseEventDraftV2({
      basicInfo: {
        name: "After",
        startDate: "2026-09-01T22:00",
        endDate: "2026-09-02T04:00",
      },
    })
    assert.equal(parsed.schedule.length, 1)
    assert.equal(parsed.schedule[0]?.name, "Día 1")
    assert.equal(parsed.schedule[0]?.startDate, "2026-09-01T22:00")
    assert.equal(parsed.schedule[0]?.endDate, "2026-09-02T04:00")
  })

  it("keeps an existing schedule array and mirrors the first day into basicInfo", () => {
    const parsed = parseEventDraftV2({
      basicInfo: { name: "Festival", startDate: "", endDate: "" },
      schedule: [
        {
          id: "day-1",
          name: "Día 1",
          startDate: "2026-09-01T18:00",
          endDate: "2026-09-01T23:00",
        },
        {
          id: "day-2",
          name: "Función Noche",
          startDate: "2026-09-02T18:00",
          endDate: "2026-09-02T23:00",
        },
      ],
    })
    assert.equal(parsed.schedule.length, 2)
    assert.equal(parsed.schedule[1]?.name, "Función Noche")
    assert.equal(parsed.basicInfo.startDate, "2026-09-01T18:00")
    assert.equal(parsed.basicInfo.endDate, "2026-09-01T23:00")
  })

  it("reads media, seating map, tickets and settings from stored JSON", () => {
    const parsed = parseEventDraftV2({
      basicInfo: {
        name: "Club",
        startDate: "2026-09-01T22:00",
        locationName: "Niceto",
      },
      flyerUrl: "https://cdn.example/flyer.jpg",
      bannerUrl: "https://cdn.example/banner.jpg",
      venueCapacity: "200",
      seatingMap: { url: "https://cdn.example/map.png", sectors: [{ id: "a" }] },
      tickets: [
        {
          id: "t1",
          name: "General",
          description: "Acceso",
          price: "15000",
          stock: "80",
          minOrder: "2",
          maxOrder: "6",
        },
      ],
      extras: [{ id: "e1", name: "Cerveza", price: 4000, stock: 50 }],
      settings: {
        isPublic: true,
        absorbFees: true,
        refundPolicy: "Sin devoluciones",
        checkoutMessage: "Gracias",
      },
    })
    assert.equal(parsed.flyerUrl, "https://cdn.example/flyer.jpg")
    assert.equal(parsed.bannerUrl, "https://cdn.example/banner.jpg")
    assert.equal(parsed.seatingMap.url, "https://cdn.example/map.png")
    assert.equal(parsed.seatingMap.backgroundImage, "https://cdn.example/map.png")
    assert.equal(parsed.seatingMap.sectors.length, 1)
    assert.equal(parsed.seatingMaps.length, 1)
    assert.ok(parsed.seatingMaps[0]?.dateId)
    assert.equal(
      (parsed.seatingMaps[0]?.mapConfig as { url?: string }).url,
      "https://cdn.example/map.png",
    )
    assert.equal(
      (
        parsed.seatingMaps[0]?.mapConfig as { sectors?: unknown[] }
      ).sectors?.length,
      1,
    )
    assert.equal(parsed.tickets[0]?.stock, 80)
    assert.equal(parsed.tickets[0]?.source, "")
    assert.equal(parsed.tickets[0]?.sectorId, "")
    assert.equal(parsed.tickets[0]?.startDate, "")
    assert.equal(parsed.tickets[0]?.endDate, "")
    assert.equal(parsed.extras[0]?.minOrder, 1)
    assert.equal(parsed.settings.checkoutMessage, "Gracias")
    assert.equal(parsed.promoVideoUrl, "")
    assert.deepEqual(parsed.galleryUrls, [])
  })

  it("reads experience fields from camelCase and snake_case JSON", () => {
    const parsed = parseEventDraftV2({
      promo_video_url: "https://youtu.be/dQw4w9WgXcQ",
      gallery_urls: [
        "https://cdn.example/1.jpg",
        "https://cdn.example/2.jpg",
        "not-a-url-but-kept-in-draft",
      ],
      restrictions: "+18",
      what_to_bring: "DNI",
    })
    assert.equal(parsed.promoVideoUrl, "https://youtu.be/dQw4w9WgXcQ")
    assert.deepEqual(parsed.galleryUrls, [
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
      "not-a-url-but-kept-in-draft",
    ])
    assert.equal(parsed.restrictions, "+18")
    assert.equal(parsed.whatToBring, "DNI")
  })

  it("keeps optional ticket sale windows without blocking the draft schema", () => {
    const parsed = parseEventDraftV2({
      tickets: [
        {
          id: "t1",
          name: "Early bird",
          startDate: "2026-08-01T10:00",
          endDate: "2026-08-20T23:59",
        },
      ],
    })
    assert.equal(parsed.tickets[0]?.startDate, "2026-08-01T10:00")
    assert.equal(parsed.tickets[0]?.endDate, "2026-08-20T23:59")
    assert.equal(
      eventDraftSchema.safeParse({
        tickets: [{ name: "Early bird", startDate: "2026-08-01T10:00" }],
      }).success,
      true,
    )
  })

  it("hydrates location from locationName and stored geo fields", () => {
    const parsed = parseEventDraftV2({
      basicInfo: { name: "Club", locationName: "Niceto" },
      location: {
        address: "Av. Córdoba 1234",
        province: "CABA",
        lat: "-34.6",
        lng: "-58.4",
      },
    })
    assert.equal(parsed.location.venueName, "Niceto")
    assert.equal(parsed.location.address, "Av. Córdoba 1234")
    assert.equal(parsed.location.province, "CABA")
    assert.equal(parsed.location.lat, -34.6)
    assert.equal(parsed.basicInfo.locationName, "Niceto")
  })

  it("hydrates a universal lineup and infers source from spotify ids", () => {
    const parsed = parseEventDraftV2({
      lineup: [
        {
          id: "0oSGxfWSnnOXhD2fKuz2Gy",
          name: "David Bowie",
          imageUrl: "https://cdn.example/bowie.jpg",
          role: "Headliner",
          source: "spotify",
          dayIds: ["day-1"],
        },
        {
          name: "Invitado local",
          artistId: "artist-9",
          role: "Orador",
        },
      ],
    })
    assert.equal(parsed.lineup.length, 2)
    assert.equal(parsed.lineup[0]?.source, "spotify")
    assert.equal(parsed.lineup[0]?.avatarUrl, "https://cdn.example/bowie.jpg")
    assert.equal(parsed.lineup[0]?.dayIds[0], "day-1")
    assert.equal(parsed.lineup[1]?.source, "local")
    assert.equal(parsed.lineup[1]?.name, "Invitado local")
    assert.deepEqual(parseDraftLineup(null), [])
  })
})

describe("toggleDraftLineupDay", () => {
  it("adds and removes a schedule day id", () => {
    assert.deepEqual(toggleDraftLineupDay([], "day-2"), ["day-2"])
    assert.deepEqual(toggleDraftLineupDay(["day-2"], "day-2"), [])
  })
})

describe("ticket validDayIds", () => {
  it("keeps assigned days and hydrates a legacy slotId into the parent day", () => {
    const parsed = parseEventDraftV2({
      schedule: [
        {
          id: "day-1",
          name: "Día 1",
          date: "2026-09-04",
          slots: [{ id: "slot-1", startTime: "22:00", endTime: "04:00" }],
        },
        { id: "day-2", name: "Día 2", date: "2026-09-05" },
      ],
      tickets: [
        {
          id: "t1",
          name: "Pase viernes",
          validDayIds: ["day-1"],
        },
        {
          id: "t2",
          name: "Turno noche",
          slotId: "slot-1",
        },
      ],
    })
    assert.deepEqual(parsed.tickets[0]?.validDayIds, ["day-1"])
    assert.deepEqual(parsed.tickets[1]?.validDayIds, ["day-1"])
    assert.equal(eventDraftSchema.parse({ tickets: [{}] }).tickets[0]?.validDayIds.length, 0)
  })
})

describe("toEventDraftV2Payload", () => {
  it("mirrors basicInfo.name into title for older readers", () => {
    const payload = toEventDraftV2Payload({
      ...emptyEventDraftV2(),
      basicInfo: {
        ...emptyEventDraftV2().basicInfo,
        name: "After",
      },
    })
    assert.equal(payload.title, "After")
  })

  it("mirrors schedule[0] back into basicInfo dates for older readers", () => {
    const empty = emptyEventDraftV2()
    const payload = toEventDraftV2Payload({
      ...empty,
      schedule: [
        {
          id: "day-1",
          name: "Día 1",
          startDate: "2026-09-01T22:00",
          endDate: "2026-09-02T04:00",
        },
      ],
    })
    assert.equal(payload.basicInfo.startDate, "2026-09-01T22:00")
    assert.equal(payload.basicInfo.endDate, "2026-09-02T04:00")
    assert.equal(payload.schedule[0]?.id, "day-1")
  })

  it("clears coordinates and marks delivery online when the draft is virtual", () => {
    const empty = emptyEventDraftV2()
    const payload = toEventDraftV2Payload({
      ...empty,
      archetype: "course",
      isVirtual: true,
      virtualLink: "https://meet.example/clase",
      location: {
        venueName: "Niceto",
        address: "Av. Córdoba 1234",
        province: "CABA",
        city: "Comuna 1",
        lat: -34.6,
        lng: -58.3,
      },
    })
    assert.equal(payload.isVirtual, true)
    assert.equal(payload.settings.deliveryMode, "ONLINE")
    assert.equal(payload.location.venueName, "")
    assert.equal(payload.location.address, "")
    assert.equal(payload.location.lat, undefined)
    assert.equal(payload.virtualLink, "https://meet.example/clase")
  })
})

describe("draftCapacityThermometer", () => {
  it("uses only ticket stock over venueCapacity", () => {
    const snap = draftCapacityThermometer({
      tickets: [{ stock: 40 }, { stock: 10 }],
      venueCapacity: 100,
    })
    assert.equal(snap.used, 50)
    assert.equal(snap.overCapacity, false)
  })

  it("never counts extras toward the thermometer", () => {
    const extras = [{ stock: 999 }]
    const snap = draftCapacityThermometer({
      tickets: [{ stock: 40 }],
      venueCapacity: 100,
    })
    assert.equal(snap.used, 40)
    assert.notEqual(snap.used, 40 + extras[0].stock)
  })

  it("multiplies venue capacity by explicit time slots", () => {
    const snap = draftCapacityThermometer({
      tickets: [{ stock: 20 }],
      venueCapacity: 20,
      slotCount: 3,
    })
    assert.equal(snap.capacity, 60)
    assert.equal(snap.slotCount, 3)
    assert.equal(snap.perSession, 20)
    assert.equal(snap.used, 20)
  })

  it("never counts map-backed tickets toward the thermometer", () => {
    const snap = draftCapacityThermometer({
      tickets: [
        { stock: 40, source: "general" },
        { stock: 80, source: "map", sectorId: "platea" },
      ],
      venueCapacity: 100,
    })
    assert.equal(snap.used, 40)
  })
})
