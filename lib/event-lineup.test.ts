import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventArtistsToLineup,
  hasEventLineup,
  parseEventLineup,
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
  })
})
