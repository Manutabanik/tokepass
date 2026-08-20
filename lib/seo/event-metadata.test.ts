import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildEventJsonLd,
  buildEventMetadata,
  buildNoindexEventMetadata,
  eventSeoFromDetails,
  resolveEventShareImage,
} from "./event-metadata"
import { buildWebsiteJsonLd } from "./website-jsonld"
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

  it("adds organizer Organization and performer lineup", () => {
    const jsonLd = buildEventJsonLd({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "luna-jachal-abc12345",
      title: "Luna en el Anfiteatro",
      description: "Show en vivo.",
      date: "2026-09-20T22:00:00.000Z",
      endsAt: "2026-09-21T02:00:00.000Z",
      location: "Jachal, San Juan",
      imageUrl: "https://cdn.example/flyer.jpg",
      venueName: "Anfiteatro Buenaventura Luna",
      venueLocation: "Jachal, San Juan",
      venueCity: "Jachal",
      venueAddress: null,
      venueRegion: "San Juan",
      prices: [15000],
      ticketsLeft: 40,
      organizer: {
        name: "Productora Luna",
        bio: "Shows en el valle.",
        imageUrl: "https://cdn.example/org.jpg",
      },
      performers: [
        { name: "DJ Norte", imageUrl: "https://cdn.example/dj.jpg" },
        { name: "Banda Sur", imageUrl: null },
      ],
    })

    const organizer = jsonLd.organizer as Record<string, unknown>
    assert.equal(organizer["@type"], "Organization")
    assert.equal(organizer.name, "Productora Luna")
    const performers = jsonLd.performer as Array<Record<string, unknown>>
    assert.equal(performers.length, 2)
    assert.equal(performers[0]?.["@type"], "PerformingGroup")
    assert.equal(performers[0]?.name, "DJ Norte")
    assert.equal(performers[1]?.name, "Banda Sur")
  })
})

describe("event open graph image", () => {
  it("prefers social_share_image_url over the flyer", () => {
    assert.equal(
      resolveEventShareImage({
        socialShareImageUrl: "https://cdn.example/share.jpg",
        imageUrl: "https://cdn.example/flyer.jpg",
      }),
      "https://cdn.example/share.jpg",
    )
    assert.equal(
      resolveEventShareImage({
        socialShareImageUrl: null,
        imageUrl: "https://cdn.example/flyer.jpg",
      }),
      "https://cdn.example/flyer.jpg",
    )

    const metadata = buildEventMetadata({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "luna-jachal-abc12345",
      title: "Luna en el Anfiteatro",
      description: "Show en vivo.",
      date: "2026-09-20T22:00:00.000Z",
      endsAt: "2026-09-21T02:00:00.000Z",
      location: "Jachal, San Juan",
      imageUrl: "https://cdn.example/flyer.jpg",
      socialShareImageUrl: "https://cdn.example/share.jpg",
      venueName: "Anfiteatro",
      venueLocation: "Jachal, San Juan",
      venueCity: "Jachal",
      venueAddress: null,
      venueRegion: "San Juan",
      prices: [15000],
    })
    const ogImages = metadata.openGraph?.images
    assert.ok(Array.isArray(ogImages))
    assert.equal(
      (ogImages[0] as { url: string }).url,
      "https://cdn.example/share.jpg",
    )
    assert.deepEqual(metadata.twitter?.images, ["https://cdn.example/share.jpg"])
  })

  it("keeps the real title and noindex when the event is paused", () => {
    const metadata = buildNoindexEventMetadata("Luna en el Anfiteatro")
    assert.equal(metadata.title, "Luna en el Anfiteatro")
    assert.deepEqual(metadata.robots, { index: false, follow: false })
  })
})

describe("eventSeoFromDetails", () => {
  it("maps share image, organizer and lineup artists", () => {
    const seo = eventSeoFromDetails({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "luna-jachal-abc12345",
      title: "Luna en el Anfiteatro",
      description: "Show en vivo.",
      date: "2026-09-20T22:00:00.000Z",
      endsAt: "2026-09-21T02:00:00.000Z",
      location: "Jachal, San Juan",
      imageUrl: "https://cdn.example/flyer.jpg",
      socialShareImageUrl: "https://cdn.example/share.jpg",
      organizerName: "Productora Luna",
      organizerBio: "Shows en el valle.",
      organizerAvatarUrl: "https://cdn.example/org.jpg",
      lineup: {
        artists: [{ name: "DJ Norte", imageUrl: "https://cdn.example/dj.jpg" }],
      },
      venue: {
        name: "Anfiteatro",
        location: "Jachal, San Juan",
        city: "Jachal",
        address: null,
      },
      tiers: [{ price: 15000, available: 10 }],
    })

    assert.equal(seo.socialShareImageUrl, "https://cdn.example/share.jpg")
    assert.equal(seo.organizer?.name, "Productora Luna")
    assert.equal(seo.performers?.[0]?.name, "DJ Norte")
  })
})

describe("website json-ld", () => {
  it("emits WebSite SearchAction on the catalog query", () => {
    const jsonLd = buildWebsiteJsonLd()
    assert.equal(jsonLd["@type"], "WebSite")
    const action = jsonLd.potentialAction as Record<string, unknown>
    assert.equal(action["@type"], "SearchAction")
    const target = action.target as Record<string, unknown>
    assert.match(String(target.urlTemplate), /\/\?q=\{search_term_string\}$/)
  })
})
