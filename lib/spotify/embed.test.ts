import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSpotifyArtistId,
  pickSpotifyArtistId,
  spotifyArtistEmbedSrc,
} from "@/lib/spotify/embed"

describe("spotify artist embed", () => {
  it("builds the compact dark theme artist embed url", () => {
    assert.equal(
      spotifyArtistEmbedSrc("0eHQ9o50hj6ZXyrqmx1rJg"),
      "https://open.spotify.com/embed/artist/0eHQ9o50hj6ZXyrqmx1rJg?utm_source=generator&theme=0&autoplay=1",
    )
  })

  it("rejects ids that cannot be embedded safely", () => {
    assert.equal(isSpotifyArtistId(""), false)
    assert.equal(isSpotifyArtistId("javascript:alert(1)"), false)
    assert.equal(isSpotifyArtistId("../open"), false)
    assert.equal(spotifyArtistEmbedSrc("bad id"), null)
  })

  it("picks the first valid spotify artist id", () => {
    assert.equal(pickSpotifyArtistId([]), null)
    assert.equal(
      pickSpotifyArtistId([
        { spotifyId: null },
        { spotifyId: "0eHQ9o50hj6ZXyrqmx1rJg" },
      ]),
      "0eHQ9o50hj6ZXyrqmx1rJg",
    )
  })
})
