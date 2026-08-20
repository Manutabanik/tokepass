import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  composeManualSeatLabel,
  parseManualSeatFields,
  parseSeatNumberInput,
} from "./manual-seat-edit"

describe("manual-seat-edit", () => {
  it("reads fila and number from a matrix label", () => {
    assert.deepEqual(
      parseManualSeatFields({ label: "Fila B - Asiento 12" }),
      { label: "Fila B - Asiento 12", row: "B", number: "12" },
    )
  })

  it("keeps an explicit row over the parsed label", () => {
    assert.deepEqual(
      parseManualSeatFields({ label: "A-4", row: "Platea", number: 9 }),
      { label: "A-4", row: "Platea", number: "9" },
    )
  })

  it("composes a visible label from fila and number", () => {
    assert.equal(
      composeManualSeatLabel({
        row: "C",
        number: "7",
        fallbackLabel: "Butaca",
      }),
      "Fila C - Asiento 7",
    )
  })

  it("parses a positive seat number", () => {
    assert.equal(parseSeatNumberInput("14"), 14)
    assert.equal(parseSeatNumberInput(""), undefined)
  })
})
