import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { composeVenuePlace, venueDedupeKey } from "./compose-location"

describe("composeVenuePlace", () => {
  it("builds display from street + department + province once", () => {
    const place = composeVenuePlace({
      street: "Anfiteatro Buenaventura Luna, Ruta Nacional 150",
      department: "Jáchal",
      province: "San Juan",
    })
    assert.equal(
      place.display,
      "Anfiteatro Buenaventura Luna, Ruta Nacional 150, Jáchal, San Juan",
    )
    assert.equal(place.city, "Jáchal, San Juan")
    assert.equal(
      place.street,
      "Anfiteatro Buenaventura Luna, Ruta Nacional 150",
    )
  })

  it("does not append city when the street already includes it", () => {
    const place = composeVenuePlace({
      street:
        "Anfiteatro Buenaventura Luna, Ruta Nacional 150, Jáchal, San Juan, Argentina",
      department: "Jáchal",
      province: "San Juan",
    })
    assert.equal(
      place.display,
      "Anfiteatro Buenaventura Luna, Ruta Nacional 150, Jáchal, San Juan, Argentina",
    )
  })

  it("strips a previously concatenated location suffix", () => {
    const place = composeVenuePlace({
      street:
        "Anfiteatro Buenaventura Luna, Ruta Nacional 150, Jáchal, San Juan, Argentina, Jáchal, San Juan, Jáchal, San Juan",
      department: "Jáchal",
      province: "San Juan",
      city: "Jáchal, San Juan",
    })
    assert.ok(!place.display.includes("Jáchal, San Juan, Jáchal"))
    assert.equal(place.city, "Jáchal, San Juan")
  })

  it("groups duplicate venues by name and place", () => {
    const a = venueDedupeKey({
      name: "Jáchal",
      city: "Jáchal, San Juan",
      location: "Ruta 150, Jáchal, San Juan",
    })
    const b = venueDedupeKey({
      name: "Jáchal",
      city: "Jáchal, San Juan",
      location: "Ruta 150, Jáchal, San Juan, Jáchal, San Juan",
    })
    assert.equal(a, b)
  })
})
