import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { APP_ERRORS } from "@/lib/errors/app-error"
import {
  INVENTORY_SYNC_MESSAGE,
  containsInternalErrorCode,
  toUserFacingError,
} from "@/lib/errors/user-facing-error"

describe("toUserFacingError", () => {
  it("enmascara códigos crudos de base de datos", () => {
    assert.equal(containsInternalErrorCode("SEATING_SECTOR_NOT_FOUND"), true)
    assert.equal(
      toUserFacingError("SEATING_SECTOR_NOT_FOUND"),
      APP_ERRORS.SEATING_SECTOR_MISMATCH.message,
    )
    assert.equal(
      toUserFacingError(
        "update_complete_event_with_seating_tx: SEATING_SECTOR_NOT_FOUND",
      ),
      APP_ERRORS.SEATING_SECTOR_MISMATCH.message,
    )
    assert.equal(toUserFacingError("PGRST204"), INVENTORY_SYNC_MESSAGE)
    assert.equal(
      toUserFacingError(
        'column "day_id" is of type uuid but expression is of type text',
      ),
      APP_ERRORS.INVALID_DAY_SELECTION.message,
    )
  })

  it("deja pasar mensajes humanos que no tienen regla", () => {
    assert.equal(
      toUserFacingError("El flyer supera los 5MB. Comprimilo o elegí otra imagen."),
      "El flyer supera los 5MB. Comprimilo o elegí otra imagen.",
    )
    assert.equal(containsInternalErrorCode("ATP"), false)
  })

  it("enmascara fugas técnicas que no son código de Postgres", () => {
    assert.equal(
      toUserFacingError("Failed to fetch"),
      INVENTORY_SYNC_MESSAGE,
    )
    assert.equal(
      toUserFacingError("Could not find the function public.create_pos_sale_tx"),
      INVENTORY_SYNC_MESSAGE,
    )
  })

  it("localiza el error de ubicación", () => {
    assert.equal(
      toUserFacingError(
        "Completá los datos del lugar / ubicación antes de publicar.",
      ),
      APP_ERRORS.ERROR_FALTA_UBICACION.message,
    )
  })
})
