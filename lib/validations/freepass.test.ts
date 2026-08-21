import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  firstZodIssue,
  freepassRegisterSchema,
  sanitizeFreepassWhatsapp,
} from "./freepass"

const LIST_ID = "11111111-1111-4111-8111-111111111111"

describe("sanitizeFreepassWhatsapp", () => {
  it("accepts a local 10-digit Argentine number without country code", () => {
    assert.equal(sanitizeFreepassWhatsapp("2645067363"), "+5492645067363")
  })

  it("strips spaces and prefixes", () => {
    assert.equal(sanitizeFreepassWhatsapp("+54 9 264 506-7363"), "+5492645067363")
    assert.equal(sanitizeFreepassWhatsapp("11 2345 6789"), "+5491123456789")
  })

  it("keeps an 8-15 digit fallback instead of rejecting the form", () => {
    assert.equal(sanitizeFreepassWhatsapp("26450673"), "26450673")
  })

  it("treats empty or junk as no phone", () => {
    assert.equal(sanitizeFreepassWhatsapp(""), null)
    assert.equal(sanitizeFreepassWhatsapp("   "), null)
    assert.equal(sanitizeFreepassWhatsapp("abc"), null)
  })
})

describe("freepassRegisterSchema", () => {
  it("lowercases and trims email", () => {
    const parsed = freepassRegisterSchema.parse({
      listId: LIST_ID,
      fullName: "  Carlos Mendoza  ",
      email: "  Carlos.Mendoza@Gmail.COM ",
      phone: "2645067363",
    })
    assert.equal(parsed.fullName, "Carlos Mendoza")
    assert.equal(parsed.email, "carlos.mendoza@gmail.com")
    assert.equal(parsed.phone, "+5492645067363")
    assert.equal(parsed.promoterId, null)
  })

  it("allows a guest without WhatsApp", () => {
    const parsed = freepassRegisterSchema.parse({
      listId: LIST_ID,
      fullName: "Ana Perez",
      email: "ana@test.com",
    })
    assert.equal(parsed.phone, null)
  })

  it("drops an invalid promoter id instead of failing the insert", () => {
    const parsed = freepassRegisterSchema.parse({
      listId: LIST_ID,
      fullName: "Ana Perez",
      email: "ana@test.com",
      promoterId: "not-a-uuid",
    })
    assert.equal(parsed.promoterId, null)
  })

  it("rejects a bad email with a specific message", () => {
    const result = freepassRegisterSchema.safeParse({
      listId: LIST_ID,
      fullName: "Ana",
      email: "no-email",
      phone: "2645067363",
    })
    assert.equal(result.success, false)
    if (!result.success) {
      assert.match(firstZodIssue(result.error), /mail válido/i)
    }
  })
})
