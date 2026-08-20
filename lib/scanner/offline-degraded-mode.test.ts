import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  OFFLINE_ADMISSION_SYNC_MINUTES,
  offlineDegradedModeMessage,
} from "./offline-degraded-mode"

describe("offline degraded mode copy", () => {
  it("states the sync interval without decoration", () => {
    assert.equal(OFFLINE_ADMISSION_SYNC_MINUTES, 5)
    assert.equal(
      offlineDegradedModeMessage(),
      "Modo degradado activo: Se requiere sincronización cada 5 minutos para evitar dobles ingresos.",
    )
  })
})
