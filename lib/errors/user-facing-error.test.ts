import assert from "node:assert/strict"
import { describe, it } from "node:test"

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
      INVENTORY_SYNC_MESSAGE,
    )
    assert.equal(
      toUserFacingError(
        "update_complete_event_with_seating_tx: SEATING_SECTOR_NOT_FOUND",
      ),
      INVENTORY_SYNC_MESSAGE,
    )
    assert.equal(toUserFacingError("PGRST204"), INVENTORY_SYNC_MESSAGE)
  })

  it("deja pasar mensajes humanos", () => {
    assert.equal(
      toUserFacingError("Completá los datos del lugar / ubicación antes de publicar."),
      "Completá los datos del lugar / ubicación antes de publicar.",
    )
    assert.equal(containsInternalErrorCode("ATP"), false)
  })
})
