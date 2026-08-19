import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isValidCbuCvu, isValidCuitCuil } from "./organizer-bank"

describe("organizer bank validation", () => {
  it("accepts a CUIT with a valid checksum", () => {
    assert.equal(isValidCuitCuil("20-12345678-6"), true)
    assert.equal(isValidCuitCuil("20123456786"), true)
  })

  it("rejects a CUIT with a broken checksum", () => {
    assert.equal(isValidCuitCuil("20123456780"), false)
    assert.equal(isValidCuitCuil("2012345678"), false)
  })

  it("accepts a 22-digit CBU with valid verifiers", () => {
    assert.equal(isValidCbuCvu("0000000000000000000000"), true)
  })

  it("rejects a CBU with a broken verifier", () => {
    assert.equal(isValidCbuCvu("0000000000000000000001"), false)
    assert.equal(isValidCbuCvu("123"), false)
  })
})
