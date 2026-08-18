import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { APP_ERRORS, wizardStepFromPath } from "@/lib/errors/app-error"
import { mapUnknownError } from "@/lib/errors/error-handler"
import { toUserFacingError } from "@/lib/errors/user-facing-error"

describe("error handler", () => {
  it("maps raw day_id uuid leaks to INVALID_DAY_SELECTION", () => {
    const mapped = mapUnknownError(
      'column "day_id" is of type uuid but expression is of type text',
    )
    assert.equal(mapped.code, "INVALID_DAY_SELECTION")
    assert.equal(mapped.message, APP_ERRORS.INVALID_DAY_SELECTION.message)
    assert.equal(mapped.action?.step, 2)
  })

  it("maps missing venue copy to ERROR_FALTA_UBICACION", () => {
    const mapped = mapUnknownError(
      "Completá los datos del lugar / ubicación antes de publicar.",
    )
    assert.equal(mapped.code, "ERROR_FALTA_UBICACION")
    assert.equal(mapped.action?.label, "Ir a gestionar ubicaciones")
  })

  it("accepts explicit application codes", () => {
    assert.equal(
      mapUnknownError({ code: "MISSING_TICKETS" }).message,
      APP_ERRORS.MISSING_TICKETS.message,
    )
  })

  it("never returns raw postgres codes", () => {
    assert.equal(mapUnknownError("PGRST204").code, "INVENTORY_SYNC")
    assert.equal(
      toUserFacingError("SEATING_SECTOR_NOT_FOUND"),
      APP_ERRORS.SEATING_SECTOR_MISMATCH.message,
    )
  })

  it("keeps already human messages that do not match a rule", () => {
    assert.equal(
      mapUnknownError("El flyer supera los 5MB. Comprimilo o elegí otra imagen.")
        .message,
      "El flyer supera los 5MB. Comprimilo o elegí otra imagen.",
    )
  })

  it("never returns raw postgres or stack traces", () => {
    assert.equal(
      mapUnknownError(
        'duplicate key value violates unique constraint "orders_pkey"',
      ).code,
      "INVENTORY_SYNC",
    )
    assert.equal(
      mapUnknownError("TypeError: Cannot read properties of undefined").code,
      "INVENTORY_SYNC",
    )
    assert.equal(
      mapUnknownError("Could not find the function public.process_pos_checkout_tx")
        .code,
      "INVENTORY_SYNC",
    )
  })

  it("routes zod paths to wizard steps", () => {
    assert.equal(wizardStepFromPath(["basics", "title"]), 0)
    assert.equal(wizardStepFromPath(["venue", "venueName"]), 1)
    assert.equal(wizardStepFromPath(["tickets", 0, "dayId"]), 2)
    assert.equal(wizardStepFromPath(["lineup", 0, "name"]), 4)
  })
})
