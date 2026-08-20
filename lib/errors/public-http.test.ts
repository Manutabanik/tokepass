import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { z } from "zod"

import { APP_ERRORS } from "@/lib/errors/app-error"
import { toPublicHttpError } from "@/lib/errors/public-http"

describe("toPublicHttpError", () => {
  it("maps session and not-found to standard HTTP codes", () => {
    assert.equal(toPublicHttpError("Iniciá sesión para continuar.").status, 401)
    assert.equal(toPublicHttpError("Evento no encontrado.").status, 404)
    assert.equal(toPublicHttpError("No tenés permiso para esta acción.").status, 403)
    assert.equal(toPublicHttpError("El aforo del evento está excedido.").status, 409)
  })

  it("maps Zod failures to 400 without issue paths", () => {
    const parsed = z.object({ dni: z.string().uuid() }).safeParse({ dni: "x" })
    assert.equal(parsed.success, false)
    if (parsed.success) return
    const mapped = toPublicHttpError(parsed.error)
    assert.equal(mapped.status, 400)
    assert.equal(mapped.code, "VALIDATION")
    assert.equal(mapped.message, "Los datos enviados no son válidos.")
  })

  it("never returns raw postgres text", () => {
    const mapped = toPublicHttpError(
      'duplicate key value violates unique constraint "orders_pkey"',
    )
    assert.equal(mapped.status, 500)
    assert.equal(mapped.message, APP_ERRORS.SAVE_FAILED.message)
    assert.doesNotMatch(mapped.message, /duplicate key|orders_pkey|UNKNOWN|500/i)
  })

  it("keeps catalog copy for known app codes", () => {
    const mapped = toPublicHttpError({ code: "EVENT_NOT_FOUND" })
    assert.equal(mapped.status, 404)
    assert.equal(mapped.message, APP_ERRORS.EVENT_NOT_FOUND.message)
  })
})
