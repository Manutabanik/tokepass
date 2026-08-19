import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapSpotifyArtist, mapSpotifyTopTrack, parseSpotifyEmbedPreview, pickSpotifyArtistImage, isSuccessfulSpotifyStatus } from "@/lib/spotify/map"

describe("spotify artist mapping", () => {
  it("prefers the 300px image and falls back to null", () => {
    assert.equal(
      pickSpotifyArtistImage([
        { url: "https://i.scdn.co/large.jpg", width: 640 },
        { url: "https://i.scdn.co/medium.jpg", width: 300 },
        { url: "https://i.scdn.co/small.jpg", width: 64 },
      ]),
      "https://i.scdn.co/medium.jpg",
    )
    assert.equal(pickSpotifyArtistImage([]), null)
    assert.equal(pickSpotifyArtistImage([{ url: "not-a-url" }]), null)
  })

  it("maps only the fields the storefront needs", () => {
    const mapped = mapSpotifyArtist({
      id: "0eHQ9o50hj6ZXyrqmx1rJg",
      name: "Bizarrap",
      genres: ["argentine hip hop", "pop argentino"],
      images: [{ url: "https://i.scdn.co/bzrp.jpg", width: 320 }],
      external_urls: { spotify: "https://open.spotify.com/artist/0eHQ9o50hj6ZXyrqmx1rJg" },
    })
    assert.deepEqual(mapped, {
      spotifyId: "0eHQ9o50hj6ZXyrqmx1rJg",
      name: "Bizarrap",
      imageUrl: "https://i.scdn.co/bzrp.jpg",
      spotifyUrl: "https://open.spotify.com/artist/0eHQ9o50hj6ZXyrqmx1rJg",
      genres: ["argentine hip hop", "pop argentino"],
    })
    assert.equal(mapSpotifyArtist({ name: "Sin ID" }), null)
    assert.equal(
      mapSpotifyArtist({
        id: "0eHQ9o50hj6ZXyrqmx1rJg",
        name: "Bizarrap",
      })?.spotifyUrl,
      "https://open.spotify.com/artist/0eHQ9o50hj6ZXyrqmx1rJg",
    )
  })

  it("accepts only 200 and 201 as successful Spotify HTTP statuses", () => {
    assert.equal(isSuccessfulSpotifyStatus(200), true)
    assert.equal(isSuccessfulSpotifyStatus(201), true)
    assert.equal(isSuccessfulSpotifyStatus(204), false)
    assert.equal(isSuccessfulSpotifyStatus(401), false)
    assert.equal(isSuccessfulSpotifyStatus(500), false)
  })

  it("picks the first top track that has a preview url", () => {
    const mapped = mapSpotifyTopTrack([
      { name: "Sin preview", preview_url: null },
      { name: "Vacio", preview_url: undefined },
      { name: "Nulo", preview_url: "null" },
      { name: "Bzrp Music Sessions", preview_url: "https://p.scdn.co/mp3-preview/demo" },
    ])
    assert.deepEqual(mapped, {
      previewUrl: "https://p.scdn.co/mp3-preview/demo",
      trackName: "Bzrp Music Sessions",
    })
    assert.deepEqual(mapSpotifyTopTrack([]), {
      previewUrl: null,
      trackName: null,
    })
  })

  it("walks the top 10 tracks until a preview url exists", () => {
    const tracks = Array.from({ length: 10 }, (_, index) => ({
      id: `track-${index}`,
      name: `Tema ${index + 1}`,
      preview_url: index === 9 ? "https://p.scdn.co/mp3-preview/last" : null,
    }))
    assert.deepEqual(mapSpotifyTopTrack(tracks), {
      previewUrl: "https://p.scdn.co/mp3-preview/last",
      trackName: "Tema 10",
    })
  })

  it("parses preview urls from Spotify embed html", () => {
    const html =
      '{"audioPreview":{"url":"https:\\u002F\\u002Fp.scdn.co\\u002Fmp3-preview\\u002Fembed"}}'
    assert.equal(
      parseSpotifyEmbedPreview(html),
      "https://p.scdn.co/mp3-preview/embed",
    )
    assert.equal(parseSpotifyEmbedPreview(""), null)
  })
})
