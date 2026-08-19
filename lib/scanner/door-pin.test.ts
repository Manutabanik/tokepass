import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  doorPinHashEquals,
  generateDoorAccessPin,
  hashDoorPinLookup,
  hashDoorPinSecret,
  normalizeDoorAccessPin,
} from "@/lib/scanner/door-pin"

describe("door access PIN", () => {
  it("normalizes a 6-digit code and rejects shorter input", () => {
    assert.equal(normalizeDoorAccessPin(" 12 34 56 "), "123456")
    assert.equal(normalizeDoorAccessPin("12345"), null)
    assert.equal(normalizeDoorAccessPin("abcdef"), null)
  })

  it("generates a 6-digit numeric PIN", () => {
    const pin = generateDoorAccessPin()
    assert.match(pin, /^\d{6}$/)
  })

  it("hashes lookup and secret differently, with timing-safe compare", () => {
    const pin = "482910"
    const lookup = hashDoorPinLookup(pin)
    const secret = hashDoorPinSecret("event-1", pin)
    assert.notEqual(lookup, secret)
    assert.equal(doorPinHashEquals(lookup, hashDoorPinLookup(pin)), true)
    assert.equal(doorPinHashEquals(lookup, hashDoorPinLookup("000000")), false)
  })
})
