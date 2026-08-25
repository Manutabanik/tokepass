import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { nominatimPlaceParts } from "@/lib/georef/nominatim"

describe("nominatimPlaceParts", () => {
  it("maps Nominatim state and city into province and city", () => {
    assert.deepEqual(
      nominatimPlaceParts({
        state: "Ciudad Autónoma de Buenos Aires",
        city: "Buenos Aires",
      }),
      {
        province: "Ciudad Autónoma de Buenos Aires",
        city: "Buenos Aires",
      },
    )
  })

  it("falls back to town, county or state_district for city", () => {
    assert.equal(
      nominatimPlaceParts({ county: "Rosario" }).city,
      "Rosario",
    )
    assert.equal(
      nominatimPlaceParts({ state_district: "Comuna 1" }).city,
      "Comuna 1",
    )
  })
})
