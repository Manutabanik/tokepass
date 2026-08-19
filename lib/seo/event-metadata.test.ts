import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildEventJsonLd } from "./event-metadata"
import { toArgentinaIso8601 } from "./site"

describe("seo argentina iso", () => {
  it("formats ISO 8601 with Buenos Aires offset", () => {
    const iso = toArgentinaIso8601("2026-08-14T22:30:00.000Z")
    assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/)
    assert.equal(iso.endsWith("-03:00"), true)
  })
})

describe("event json-ld", () => {
  it("emits Schema.org Event with AggregateOffer in ARS", () => {
    const jsonLd = buildEventJsonLd({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "luna-jachal-abc12345",
      title: "Luna en el Anfiteatro",
      description: "Show en vivo.",
      date: "2026-09-20T22:00:00.000Z",
      endsAt: "2026-09-21T02:00:00.000Z",
      createdAt: "2026-08-01T15:00:00.000Z",
      location: "Jachal, San Juan",
      imageUrl: "https://cdn.example/flyer.jpg",
      venueName: "Anfiteatro Buenaventura Luna",
      venueLocation: "Jachal, San Juan",
      venueCity: "Jachal",
      venueAddress: null,
      venueRegion: "San Juan",
      prices: [15000, 28000],
      ticketsLeft: 40,
    })

    assert.equal(jsonLd["@type"], "Event")
    assert.equal(jsonLd.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode")
    const offers = jsonLd.offers as Record<string, unknown>
    assert.equal(offers["@type"], "AggregateOffer")
    assert.equal(offers.priceCurrency, "ARS")
    assert.equal(offers.lowPrice, 15000)
    assert.equal(offers.highPrice, 28000)
    assert.equal(offers.availability, "https://schema.org/InStock")
    const seller = offers.seller as Record<string, unknown>
    assert.equal(seller.name, "TokePass")
  })
})
