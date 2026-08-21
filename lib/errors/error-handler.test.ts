import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { APP_ERRORS, wizardStepFromPath } from "@/lib/errors/app-error"
import { mapUnknownError } from "@/lib/errors/error-handler"
import { firstFieldErrorPath } from "@/lib/errors/form-field"
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
    assert.equal(mapped.action?.label, "Corregir campo")
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
      "SAVE_FAILED",
    )
    assert.equal(
      mapUnknownError("TypeError: Cannot read properties of undefined").code,
      "SAVE_FAILED",
    )
    assert.equal(
      mapUnknownError("Could not find the function public.process_pos_checkout_tx")
        .code,
      "SAVE_FAILED",
    )
  })

  it("never shows UNKNOWN, Error 500 or Internal Server Error", () => {
    for (const raw of ["UNKNOWN", "Error 500", "Internal Server Error", { code: "UNKNOWN" }]) {
      const mapped = mapUnknownError(raw)
      assert.notEqual(mapped.code, "UNKNOWN")
      assert.notEqual(mapped.message.toUpperCase(), "UNKNOWN")
      assert.doesNotMatch(mapped.message, /error 500|internal server error/i)
      assert.doesNotMatch(mapped.title, /unknown|error 500|internal server error/i)
    }
  })

  it("maps Unauthorized and Token expired to session copy", () => {
    for (const raw of ["Unauthorized", "Token expired", "JWT expired"]) {
      const mapped = mapUnknownError(raw)
      assert.equal(mapped.code, "SESSION_REQUIRED")
      assert.equal(mapped.message, APP_ERRORS.SESSION_REQUIRED.message)
      assert.doesNotMatch(mapped.message, /unauthorized|token expired|jwt expired/i)
    }
  })

  it("prefers the human message when the code is UNKNOWN", () => {
    const mapped = mapUnknownError({
      code: "UNKNOWN",
      message: "El cupo total supera el aforo permitido.",
    })
    assert.equal(mapped.message, "El cupo total supera el aforo permitido.")
    assert.notEqual(mapped.code, "UNKNOWN")
  })

  it("routes zod paths to wizard steps", () => {
    assert.equal(wizardStepFromPath(["basics", "title"]), 0)
    assert.equal(wizardStepFromPath(["basics", "date"]), 0)
    assert.equal(wizardStepFromPath(["basics", "scheduleDays"]), 0)
    assert.equal(wizardStepFromPath(["basics", "visibility"]), 3)
    assert.equal(wizardStepFromPath(["venue", "venueName"]), 0)
    assert.equal(wizardStepFromPath(["tickets", 0, "dayId"]), 2)
    assert.equal(wizardStepFromPath(["maxTicketsPerUser"]), 2)
    assert.equal(wizardStepFromPath(["lineup", 0, "name"]), 4)
  })

  it("reads the first react-hook-form error path", () => {
    assert.equal(
      firstFieldErrorPath({
        basics: { title: { type: "too_small", message: "El título debe tener al menos 3 caracteres." } },
      }),
      "basics.title",
    )
    assert.equal(
      firstFieldErrorPath({
        tickets: { root: { type: "too_small", message: "Creá al menos un tipo de entrada." } },
      }),
      "tickets",
    )
  })
})
