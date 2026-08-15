import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  mapArtistHit,
  mapLineupItem,
  normalizeArtistName,
  normalizeOptionalUrl,
  sanitizeArtistQuery,
  serializeLineupForEvent,
} from "@/lib/artists"

describe("artist helpers", () => {
  it("sanitizes ilike wildcards", () => {
    assert.equal(sanitizeArtistQuery("  Bi%zar_rap  "), "Bizarrap")
  })

  it("rejects empty artist names", () => {
    assert.equal(normalizeArtistName("   "), null)
    assert.equal(normalizeArtistName("Bizarrap"), "Bizarrap")
  })

  it("accepts http image urls and rejects junk", () => {
    assert.equal(
      normalizeOptionalUrl("https://cdn.example/a.jpg"),
      "https://cdn.example/a.jpg",
    )
    assert.equal(normalizeOptionalUrl("javascript:alert(1)"), undefined)
    assert.equal(normalizeOptionalUrl(""), null)
  })

  it("maps artist and lineup rows to camelCase", () => {
    const artist = mapArtistHit({
      id: "a1",
      name: "Nathy",
      image_url: "https://cdn.example/n.jpg",
      spotify_id: "sp1",
    })
    assert.equal(artist.imageUrl, "https://cdn.example/n.jpg")
    assert.equal(artist.spotifyId, "sp1")
    assert.equal(artist.topTrackPreviewUrl, null)
    assert.equal(artist.topTrackName, null)

    const item = mapLineupItem({
      id: "ea1",
      event_id: "e1",
      artist_id: "a1",
      sort_order: 3,
      is_headliner: true,
      artists: { id: "a1", name: "Nathy" },
    })
    assert.equal(item.order, 3)
    assert.equal(item.artist.name, "Nathy")
    assert.equal(item.isHeadliner, true)
  })

  it("serializes is_headliner for the JSON fallback", () => {
    const payload = serializeLineupForEvent([
      {
        id: "ea1",
        artistId: "a1",
        lineupEntryId: "ea1",
        spotifyId: null,
        name: "Nathy",
        imageUrl: null,
        genre: null,
        performanceTime: "23:00",
        stage: "Main",
        order: 0,
        isHeadliner: true,
        topTrackPreviewUrl: "https://p.scdn.co/mp3-preview/nathy",
        topTrackName: "Business Woman",
      },
    ])
    assert.equal(payload[0]?.is_headliner, true)
    assert.equal(payload[0]?.top_track_preview_url, "https://p.scdn.co/mp3-preview/nathy")
    assert.equal(payload[0]?.top_track_name, "Business Woman")
  })
})
