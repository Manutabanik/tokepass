import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isStrictEmail,
  isValidDni,
  normalizeArgentineMobile,
  suggestEmailTypo,
} from "@/lib/checkout/guest-input"

describe("guest checkout input", () => {
  it("rejects loose email syntax and suggests gmail typos", () => {
    assert.equal(isStrictEmail("ana@gmail.com"), true)
    assert.equal(isStrictEmail("ana@gmai.com"), true)
    assert.equal(isStrictEmail("ana..perez@gmail.com"), false)
    assert.equal(isStrictEmail("ana@gmail"), false)
    assert.equal(suggestEmailTypo("ana@gmai.com"), "ana@gmail.com")
    assert.equal(suggestEmailTypo("ana@gmail.com"), null)
  })

  it("accepts DNI of 7 or 8 digits only", () => {
    assert.equal(isValidDni("30111222"), true)
    assert.equal(isValidDni("1234567"), true)
    assert.equal(isValidDni("123456789"), false)
    assert.equal(isValidDni("12.345.678"), true)
    assert.equal(isValidDni("123456"), false)
  })

  it("normalizes Argentine mobiles to +549", () => {
    assert.equal(normalizeArgentineMobile("1123456789"), "+5491123456789")
    assert.equal(normalizeArgentineMobile("+54 9 11 2345-6789"), "+5491123456789")
    assert.equal(normalizeArgentineMobile("5491123456789"), "+5491123456789")
    assert.equal(normalizeArgentineMobile("2645067363"), "+5492645067363")
    assert.equal(normalizeArgentineMobile("123"), null)
  })
})
