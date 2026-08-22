import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { APP_ERRORS } from "./app-error"
import { actionHintFromError, guidedActionFailure } from "./guided-action"

describe("guided action errors", () => {
  it("keeps a catalog hint for persist failures", () => {
    assert.equal(
      actionHintFromError(APP_ERRORS.FLYER_TOO_LARGE),
      "Usá un JPG o PNG de menos de 5 MB.",
    )
    assert.match(
      actionHintFromError(APP_ERRORS.SAVE_FAILED),
      /conexión/i,
    )
  })

  it("returns a structured failure without throwing", () => {
    const result = guidedActionFailure("El link del evento ya está en uso.", {
      field: "basics.title",
      actionHint: "Probá agregando el año al final, ej: mi-evento-2026",
    })
    assert.equal(result.success, false)
    assert.equal(result.field, "basics.title")
    assert.match(result.actionHint ?? "", /año/)
  })
})
