import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { CatalogEvent } from "@/app/actions/public-events"
import { filterCatalogEvents } from "@/lib/discovery-filters"

function event(partial: Partial<CatalogEvent> & Pick<CatalogEvent, "id" | "title">): CatalogEvent {
  return {
    slug: partial.id,
    description: null,
    date: "2026-09-01T00:00:00.000Z",
    endsAt: null,
    scheduleDays: [],
    location: "CABA",
    imageUrl: null,
    status: "published",
    venueName: null,
    venueLocation: null,
    organizerName: null,
    startingPrice: null,
    soldRatio: null,
    ticketsLeft: null,
    isFeatured: false,
    featuredTier: null,
    featuredUntil: null,
    isSponsoredByTokePass: false,
    categoryId: null,
    artists: [],
    ...partial,
  }
}

describe("filterCatalogEvents", () => {
  const catalog = [
    event({
      id: "e1",
      title: "Noche Club",
      description: "After en Palermo",
      artists: [{ id: "a1", name: "Nathy Peluso", imageUrl: null }],
    }),
    event({
      id: "e2",
      title: "Sunset",
      artists: [{ id: "a2", name: "Bizarrap", imageUrl: null }],
    }),
  ]

  it("matches published events by lineup artist name", () => {
    const filtered = filterCatalogEvents(catalog, { query: "nathy" })
    assert.deepEqual(
      filtered.map((item) => item.id),
      ["e1"],
    )
  })

  it("keeps only events linked to selectedArtistId via EventArtist", () => {
    const filtered = filterCatalogEvents(catalog, { artistId: "a2" })
    assert.deepEqual(
      filtered.map((item) => item.id),
      ["e2"],
    )
  })

  it("combines text search with selected artist as AND", () => {
    const miss = filterCatalogEvents(catalog, {
      query: "palermo",
      artistId: "a2",
    })
    assert.equal(miss.length, 0)

    const hit = filterCatalogEvents(catalog, {
      query: "nathy",
      artistId: "a1",
    })
    assert.equal(hit[0]?.id, "e1")
  })

  it("matches CABA aliases when filtering by Ciudad Autónoma", () => {
    const withCaba = [
      event({
        id: "e3",
        title: "CABA night",
        location: "Palermo, CABA",
        venueLocation: "CABA",
      }),
      event({
        id: "e4",
        title: "Mendoza night",
        location: "Mendoza",
        venueLocation: "Mendoza",
      }),
    ]
    const filtered = filterCatalogEvents(withCaba, {
      city: "Ciudad Autónoma de Buenos Aires",
    })
    assert.deepEqual(
      filtered.map((item) => item.id),
      ["e3"],
    )
  })

  it("filters by Argentina calendar presets", () => {
    const now = new Date("2026-08-15T18:00:00-03:00")
    const dated = [
      event({
        id: "today",
        title: "Hoy",
        date: "2026-08-15T22:00:00.000Z",
      }),
      event({
        id: "later",
        title: "Septiembre",
        date: "2026-09-02T22:00:00.000Z",
      }),
    ]
    assert.equal(
      filterCatalogEvents(dated, { datePreset: "today", now })[0]?.id,
      "today",
    )
    assert.equal(
      filterCatalogEvents(dated, { datePreset: "weekend", now })[0]?.id,
      "today",
    )
    assert.equal(
      filterCatalogEvents(dated, { datePreset: "month", now }).length,
      1,
    )
  })
})
