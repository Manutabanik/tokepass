import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formHasInventoryOrVenue,
} from "@/lib/events/event-inventory-fingerprint"

describe("formHasInventoryOrVenue", () => {
  it("ignores the blank default ticket after sanitize defaults", () => {
    assert.equal(
      formHasInventoryOrVenue({
        tickets: [
          {
            name: "",
            price: 0,
            capacity: 1,
            layoutType: "general",
          } as never,
        ],
        venue: {
          venueName: "",
          venueLocation: "",
          existingVenueId: null,
          includesSeatingMap: false,
          zones: [],
        } as never,
      }),
      false,
    )
  })

  it("does not treat a partial address or placeholder capacity as inventory", () => {
    assert.equal(
      formHasInventoryOrVenue({
        tickets: [],
        venue: {
          venueName: "",
          venueLocation: "Av. Libertador 12",
          capacity: 1,
          existingVenueId: null,
          includesSeatingMap: false,
          zones: [],
        } as never,
      }),
      false,
    )
  })

  it("detects a named ticket or a real venue", () => {
    assert.equal(
      formHasInventoryOrVenue({
        tickets: [{ name: "General", price: 0, capacity: 20 } as never],
        venue: { venueName: "", existingVenueId: null } as never,
      }),
      true,
    )
    assert.equal(
      formHasInventoryOrVenue({
        tickets: [],
        venue: {
          venueName: "Club Central",
          existingVenueId: null,
        } as never,
      }),
      true,
    )
  })
})
