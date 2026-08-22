import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventArtistsToLineup,
  filterLineupByDay,
  hasArtistAudioPreview,
  hasEventLineup,
  parseEventLineup,
  resolveLineupArtistDayId,
  visibleLineupArtists,
} from "@/lib/event-lineup"

describe("parseEventLineup", () => {
  it("returns empty data for invalid input", () => {
    assert.deepEqual(parseEventLineup(null), { artists: [], slots: [] })
    assert.equal(hasEventLineup(parseEventLineup({})), false)
  })

  it("parses a combined artist array with set times", () => {
    const parsed = parseEventLineup([
      {
        name: "Bizarrap",
        image_url: "https://cdn.example/bzrp.jpg",
        role: "Headliner",
        time: "00:30",
      },
    ])
    assert.equal(parsed.artists[0]?.name, "Bizarrap")
    assert.equal(parsed.artists[0]?.imageUrl, "https://cdn.example/bzrp.jpg")
    assert.equal(parsed.artists[0]?.performanceTime, "00:30")
    assert.equal(parsed.slots[0]?.time, "00:30")
    assert.equal(parsed.slots[0]?.title, "Bizarrap")
    assert.equal(parsed.artists[0]?.isHeadliner, false)
    assert.equal(parsed.artists[0]?.dayId, null)
    assert.equal(parsed.artists[0]?.topTrackPreviewUrl, null)
    assert.equal(parsed.artists[0]?.spotifyId, null)
  })

  it("parses artists and schedule objects", () => {
    const parsed = parseEventLineup({
      artists: [{ name: "Nathy Peluso", photo: "https://cdn.example/n.jpg" }],
      schedule: [
        {
          time: "23:00",
          title: "Apertura de puertas",
          description: "Acceso general",
        },
      ],
    })
    assert.equal(parsed.artists.length, 1)
    assert.equal(parsed.slots[0]?.title, "Apertura de puertas")
    assert.equal(hasEventLineup(parsed), true)
  })

  it("parses is_headliner from JSON fallback payloads", () => {
    const parsed = parseEventLineup([
      { name: "Bizarrap", is_headliner: true, time: "00:30" },
      { name: "Nathy Peluso", isHeadliner: false },
    ])
    assert.equal(parsed.artists[0]?.isHeadliner, true)
    assert.equal(parsed.artists[1]?.isHeadliner, false)
  })

  it("parses top track preview fields from JSON payloads", () => {
    const parsed = parseEventLineup([
      {
        name: "Bizarrap",
        top_track_preview_url: "https://p.scdn.co/mp3-preview/bzrp",
        top_track_name: "Music Sessions",
        spotify_id: "0eHQ9o50hj6ZXyrqmx1rJg",
      },
    ])
    assert.equal(
      parsed.artists[0]?.topTrackPreviewUrl,
      "https://p.scdn.co/mp3-preview/bzrp",
    )
    assert.equal(parsed.artists[0]?.topTrackName, "Music Sessions")
    assert.equal(parsed.artists[0]?.spotifyId, "0eHQ9o50hj6ZXyrqmx1rJg")
    assert.equal(hasArtistAudioPreview(parsed.artists[0]!), true)
    assert.equal(
      hasArtistAudioPreview({ topTrackPreviewUrl: null }),
      false,
    )
  })

  it("parses spotify_preview_url aliases as the artist preview", () => {
    const parsed = parseEventLineup([
      {
        name: "Nathy Peluso",
        spotify_preview_url: "https://p.scdn.co/mp3-preview/nathy",
      },
    ])
    assert.equal(
      parsed.artists[0]?.topTrackPreviewUrl,
      "https://p.scdn.co/mp3-preview/nathy",
    )
    assert.equal(hasArtistAudioPreview(parsed.artists[0]!), true)
  })
})

describe("eventArtistsToLineup", () => {
  it("maps relational EventArtist rows with nested Artist", () => {
    const parsed = eventArtistsToLineup([
      {
        id: "ea-2",
        sort_order: 2,
        performance_time: "2026-11-13T03:30:00.000Z",
        stage: "Main",
        artists: {
          id: "a-bzrp",
          name: "Bizarrap",
          image_url: "https://cdn.example/bzrp.jpg",
          spotify_id: "0eHQ9o50hj6ZXyrqmx1rJg",
        },
      },
      {
        id: "ea-1",
        sort_order: 1,
        performance_time: null,
        artists: { id: "a-nathy", name: "Nathy Peluso" },
      },
    ])
    assert.equal(parsed.artists[0]?.name, "Nathy Peluso")
    assert.equal(parsed.artists[1]?.name, "Bizarrap")
    assert.equal(parsed.artists[1]?.performanceTime, "2026-11-13T03:30:00.000Z")
    assert.equal(parsed.slots.length, 1)
    assert.equal(parsed.slots[0]?.title, "Bizarrap")
    assert.equal(parsed.slots[0]?.description, "Main")
    assert.equal(parsed.artists[0]?.isHeadliner, false)
    assert.equal(parsed.artists[1]?.isHeadliner, false)
    assert.equal(parsed.artists[0]?.spotifyId, null)
    assert.equal(parsed.artists[1]?.spotifyId, "0eHQ9o50hj6ZXyrqmx1rJg")
  })

  it("maps is_headliner from EventArtist rows", () => {
    const parsed = eventArtistsToLineup([
      {
        id: "ea-1",
        sort_order: 1,
        is_headliner: true,
        artists: { id: "a-1", name: "Bizarrap" },
      },
      {
        id: "ea-2",
        sort_order: 2,
        is_headliner: false,
        artists: { id: "a-2", name: "Nathy Peluso" },
      },
    ])
    assert.equal(parsed.artists[0]?.isHeadliner, true)
    assert.equal(parsed.artists[1]?.isHeadliner, false)
  })
})

describe("visibleLineupArtists", () => {
  const names = ["A", "B", "C", "D", "E", "F"]
  const artists = names.map((name, index) => ({
    id: `a-${index}`,
    name,
    imageUrl: null,
    role: null,
    performanceTime: null,
    dayId: null,
    isHeadliner: false,
    spotifyId: null,
    topTrackPreviewUrl: null,
    topTrackName: null,
  }))

  it("falls back to the first four artists when none are headliners", () => {
    const visible = visibleLineupArtists(artists)
    assert.deepEqual(
      visible.featured.map((artist) => artist.name),
      ["A", "B", "C", "D"],
    )
    assert.equal(visible.remainingCount, 2)
  })

  it("shows only marked headliners when present", () => {
    const withHeadliners = artists.map((artist, index) => ({
      ...artist,
      isHeadliner: index === 1 || index === 4,
    }))
    const visible = visibleLineupArtists(withHeadliners)
    assert.deepEqual(
      visible.featured.map((artist) => artist.name),
      ["B", "E"],
    )
    assert.equal(visible.remainingCount, 4)
  })

  it("hides the overflow control when every artist is already featured", () => {
    const visible = visibleLineupArtists(artists.slice(0, 3))
    assert.equal(visible.featured.length, 3)
    assert.equal(visible.remainingCount, 0)
  })
})

describe("filterLineupByDay", () => {
  const days = [
    {
      id: "jue",
      title: "Jueves",
      start_time: "2026-11-12T22:00:00.000Z",
      end_time: "2026-11-13T06:00:00.000Z",
    },
    {
      id: "vie",
      title: "Viernes",
      start_time: "2026-11-13T22:00:00.000Z",
      end_time: "2026-11-14T06:00:00.000Z",
    },
  ]

  function artist(
    name: string,
    extras: Partial<{ dayId: string | null; performanceTime: string | null }> = {},
  ) {
    return {
      id: name,
      name,
      imageUrl: null,
      role: null,
      performanceTime: extras.performanceTime ?? null,
      dayId: extras.dayId ?? null,
      isHeadliner: false,
      spotifyId: null,
      topTrackPreviewUrl: null,
      topTrackName: null,
    }
  }

  it("reads explicit day_id from JSON payloads", () => {
    const parsed = parseEventLineup([
      { name: "Chaqueño Palavecino", day_id: "jue" },
    ])
    assert.equal(parsed.artists[0]?.dayId, "jue")
  })

  it("infers the day from a performance timestamp", () => {
    assert.equal(
      resolveLineupArtistDayId(
        { dayId: null, performanceTime: "2026-11-13T23:30:00.000Z" },
        days,
      ),
      "vie",
    )
  })

  it("filters bound artists to the selected day", () => {
    const data = {
      artists: [
        artist("Jueves Headliner", { dayId: "jue" }),
        artist("Viernes Headliner", { dayId: "vie" }),
      ],
      slots: [],
    }
    const jue = filterLineupByDay(data, "jue", days)
    const vie = filterLineupByDay(data, "vie", days)
    assert.deepEqual(
      jue.artists.map((item) => item.name),
      ["Jueves Headliner"],
    )
    assert.deepEqual(
      vie.artists.map((item) => item.name),
      ["Viernes Headliner"],
    )
  })

  it("keeps the full lineup when no artist is bound to a day", () => {
    const data = {
      artists: [artist("A"), artist("B")],
      slots: [],
    }
    const filtered = filterLineupByDay(data, "jue", days)
    assert.equal(filtered.artists.length, 2)
  })
})
