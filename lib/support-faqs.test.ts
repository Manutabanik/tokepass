import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseSupportFaqInput } from "./support-faqs"

describe("parseSupportFaqInput", () => {
  it("accepts a valid question and answer", () => {
    const parsed = parseSupportFaqInput({
      question: "  Como reembolso?  ",
      answer: "Escribinos a soporte con el numero de orden.",
      isActive: "true",
      order: "12",
    })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.value.question, "Como reembolso?")
      assert.equal(parsed.value.isActive, true)
      assert.equal(parsed.value.order, 12)
    }
  })

  it("rejects a short question", () => {
    const parsed = parseSupportFaqInput({
      question: "No",
      answer: "Respuesta suficientemente larga",
    })
    assert.equal(parsed.ok, false)
  })

  it("treats missing toggle as inactive", () => {
    const parsed = parseSupportFaqInput({
      question: "Donde esta mi entrada?",
      answer: "En tu billetera, seccion Entradas.",
    })
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.value.isActive, false)
  })
})
