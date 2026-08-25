import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftLineupToLineupDraftItems,
  eventArtistRowsToDraftLineup,
} from "@/lib/events/publish-event-v2-lineup"
import { createDraftLineupItem } from "@/lib/validations/event-draft-v2"

const LOCAL_ID = "550e8400-e29b-41d4-a716-446655440000"

describe("draftLineupToLineupDraftItems", () => {
  it("maps local UUIDs, Spotify ids and skips nameless rows", () => {
    const mapped = draftLineupToLineupDraftItems([
      createDraftLineupItem({
        id: LOCAL_ID,
        name: "Wos",
        avatarUrl: "https://cdn.example/wos.jpg",
        role: "Headliner",
        source: "local",
      }),
      createDraftLineupItem({
        id: "spotify-artist-1",
        name: "Nathy Peluso",
        source: "spotify",
        role: "Invitada",
      }),
      createDraftLineupItem({
        id: "custom-1",
        name: "DJ Local",
        source: "custom",
        role: "Apertura",
      }),
      createDraftLineupItem({
        id: "skip",
        name: "   ",
        source: "custom",
      }),
    ])

    assert.equal(mapped.length, 3)
    assert.equal(mapped[0]?.artistId, LOCAL_ID)
    assert.equal(mapped[0]?.spotifyId, null)
    assert.equal(mapped[0]?.stage, "Headliner")
    assert.equal(mapped[0]?.imageUrl, "https://cdn.example/wos.jpg")
    assert.equal(mapped[1]?.artistId, null)
    assert.equal(mapped[1]?.spotifyId, "spotify-artist-1")
    assert.equal(mapped[1]?.stage, "Invitada")
    assert.equal(mapped[2]?.artistId, null)
    assert.equal(mapped[2]?.spotifyId, null)
    assert.equal(mapped[2]?.name, "DJ Local")
  })
})

describe("eventArtistRowsToDraftLineup", () => {
  it("rebuilds draft lineup from event_artists + nested artists", () => {
    const lineup = eventArtistRowsToDraftLineup([
      {
        artist_id: LOCAL_ID,
        stage: "Cierre",
        sort_order: 1,
        artists: {
          id: LOCAL_ID,
          name: "Wos",
          image_url: "https://cdn.example/wos.jpg",
          spotify_id: null,
        },
      },
      {
        artist_id: "550e8400-e29b-41d4-a716-446655440111",
        stage: null,
        sort_order: 0,
        artists: {
          id: "550e8400-e29b-41d4-a716-446655440111",
          name: "Nathy",
          image_url: null,
          spotify_id: "spotify-nathy",
        },
      },
    ])

    assert.equal(lineup.length, 2)
    assert.equal(lineup[0]?.name, "Nathy")
    assert.equal(lineup[0]?.source, "spotify")
    assert.equal(lineup[0]?.id, "spotify-nathy")
    assert.equal(lineup[1]?.name, "Wos")
    assert.equal(lineup[1]?.source, "local")
    assert.equal(lineup[1]?.id, LOCAL_ID)
    assert.equal(lineup[1]?.role, "Cierre")
  })
})
