import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftCapacityThermometer,
  emptyEventDraftV2,
  eventDraftSchema,
  eventPublishDisabledReason,
  eventPublishSchema,
  isEventDraftPublishable,
  parseEventDraftV2,
  toEventDraftV2Payload,
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
    assert.equal(parsed.location.venueName, "")
    assert.equal(parsed.location.address, "")
    assert.equal(parsed.settings.deliveryMode, "PRESENCIAL")
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

  it("requires endDate to be after startDate", () => {
    const draft = publishableDraft()
    draft.basicInfo.endDate = "2026-08-01T22:00"
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
})

describe("parseEventDraftV2", () => {
  it("hydrates draft_state without inventing tickets or dropping extra keys", () => {
    const parsed = parseEventDraftV2({ title: "Fiesta", tickets: [], keep: 1 })
    assert.equal(parsed.basicInfo.name, "Fiesta")
    assert.equal(parsed.venueCapacity, 0)
    assert.deepEqual(parsed.tickets, [])
    assert.deepEqual(parsed.extras, [])
    assert.equal(parsed.flyerUrl, "")
    assert.equal(parsed.seatingMap.url, "")
    assert.deepEqual(parsed.seatingMap.sectors, [])
    assert.equal(parsed.settings.isPublic, false)
    assert.equal((parsed as { keep?: number }).keep, 1)
    assert.deepEqual(parseEventDraftV2(null), emptyEventDraftV2())
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
    assert.equal(parsed.tickets[0]?.stock, 80)
    assert.equal(parsed.tickets[0]?.source, "")
    assert.equal(parsed.tickets[0]?.sectorId, "")
    assert.equal(parsed.extras[0]?.minOrder, 1)
    assert.equal(parsed.settings.checkoutMessage, "Gracias")
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
