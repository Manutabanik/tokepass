import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { canvasLabelFill } from "./canvas-label-fill"

describe("canvasLabelFill", () => {
  it("usa zinc claro cuando no hay color", () => {
    assert.equal(canvasLabelFill(undefined), "#e4e4e7")
    assert.equal(canvasLabelFill("  "), "#e4e4e7")
  })

  it("aclara negros y grises oscuros sobre el lienzo", () => {
    assert.equal(canvasLabelFill("#000"), "#e4e4e7")
    assert.equal(canvasLabelFill("#111827"), "#e4e4e7")
    assert.equal(canvasLabelFill("black"), "#e4e4e7")
  })

  it("respeta colores claros guardados", () => {
    assert.equal(canvasLabelFill("#e4e4e7"), "#e4e4e7")
    assert.equal(canvasLabelFill("#a1a1aa"), "#a1a1aa")
  })
})
