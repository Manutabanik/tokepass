import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCatalogSearchOr,
  mapCatalogEventArtists,
  rankFeaturedArtists,
  rankFeaturedArtistsFromCatalog,
  sanitizeCatalogSearch,
} from "@/lib/discovery-artists"

describe("discovery artists", () => {
  it("strips PostgREST-breaking characters from search", () => {
    assert.equal(sanitizeCatalogSearch("  Biza%ra_p, (live)  "), "Bizarap live")
  })

  it("includes event ids from lineup matches in the catalog or-filter", () => {
    const filter = buildCatalogSearchOr("nathy", ["e1", "e2"])
    assert.equal(
      filter,
      "title.ilike.%nathy%,description.ilike.%nathy%,location.ilike.%nathy%,id.in.(e1,e2)",
    )
  })

  it("maps EventArtist joins before JSON lineup fallback", () => {
    const artists = mapCatalogEventArtists({
      eventArtists: [
        {
          artist_id: "a1",
          artists: { id: "a1", name: "Nathy Peluso", image_url: "https://cdn/n.jpg" },
        },
      ],
      lineupJson: [{ name: "Otro" }],
    })
    assert.equal(artists.length, 1)
    assert.equal(artists[0]?.id, "a1")
    assert.equal(artists[0]?.name, "Nathy Peluso")
  })

  it("ranks artists with the most active events first", () => {
    const ranked = rankFeaturedArtists(
      [
        { id: "b", name: "Bizarrap", imageUrl: null },
        { id: "a", name: "A", imageUrl: null },
        { id: "b", name: "Bizarrap", imageUrl: "https://cdn/b.jpg" },
        { id: "b", name: "Bizarrap", imageUrl: null },
        { id: "c", name: "Cazzu", imageUrl: null },
        { id: "c", name: "Cazzu", imageUrl: null },
      ],
      2,
    )
    assert.equal(ranked.length, 2)
    assert.equal(ranked[0]?.id, "b")
    assert.equal(ranked[0]?.activeEventCount, 3)
    assert.equal(ranked[0]?.imageUrl, "https://cdn/b.jpg")
    assert.equal(ranked[1]?.id, "c")
  })

  it("derives featured artists from catalog lineups", () => {
    const ranked = rankFeaturedArtistsFromCatalog([
      { artists: [{ id: "a", name: "A", imageUrl: null }] },
      { artists: [{ id: "a", name: "A", imageUrl: null }] },
      { artists: [{ id: "z", name: "Z", imageUrl: null }] },
    ])
    assert.equal(ranked[0]?.id, "a")
    assert.equal(ranked[0]?.activeEventCount, 2)
  })
})
