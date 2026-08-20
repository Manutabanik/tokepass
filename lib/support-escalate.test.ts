import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildSupportEscalateMessage } from "./support-escalate"

describe("buildSupportEscalateMessage", () => {
  it("asks for a person when no FAQ was opened", () => {
    assert.equal(
      buildSupportEscalateMessage(),
      "Necesito hablar con soporte.",
    )
    assert.equal(
      buildSupportEscalateMessage("   "),
      "Necesito hablar con soporte.",
    )
  })

  it("includes the consulted question for the inbox", () => {
    assert.equal(
      buildSupportEscalateMessage("  Como reembolso?  "),
      "Consulté la pregunta: Como reembolso?\n\nNecesito hablar con soporte.",
    )
  })
})
