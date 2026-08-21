import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { CatalogEvent } from "@/app/actions/public-events"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"
import { eventMatchesNiche } from "@/lib/discovery-niches"

function event(
  partial: Partial<CatalogEvent> & Pick<CatalogEvent, "id" | "title">,
): CatalogEvent {
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
    deliveryMode: "PRESENCIAL",
    artists: [],
    ...partial,
  }
}

describe("eventMatchesNiche", () => {
  it("puts uncategorized presencial events in entertainment", () => {
    const row = event({ id: "e1", title: "Noche Club" })
    assert.equal(eventMatchesNiche(row, "entertainment", DEFAULT_DISCOVERY_CATEGORIES), true)
    assert.equal(eventMatchesNiche(row, "courses", DEFAULT_DISCOVERY_CATEGORIES), false)
  })

  it("puts online events without sports category in courses", () => {
    const row = event({
      id: "e2",
      title: "Live stream",
      deliveryMode: "ONLINE",
      location: null,
    })
    assert.equal(eventMatchesNiche(row, "courses", DEFAULT_DISCOVERY_CATEGORIES), true)
    assert.equal(eventMatchesNiche(row, "entertainment", DEFAULT_DISCOVERY_CATEGORIES), false)
  })

  it("keeps recitales in entertainment even if streamed", () => {
    const row = event({
      id: "e3",
      title: "Tour",
      categoryId: "recitales",
      deliveryMode: "ONLINE",
    })
    assert.equal(eventMatchesNiche(row, "entertainment", DEFAULT_DISCOVERY_CATEGORIES), true)
    assert.equal(eventMatchesNiche(row, "courses", DEFAULT_DISCOVERY_CATEGORIES), false)
  })
})
