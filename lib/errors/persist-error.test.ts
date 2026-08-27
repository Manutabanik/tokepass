import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ZodError } from "zod"

import { ORPHAN_SEATING_SECTOR_MESSAGE } from "@/lib/events/sanitize-ticket-tiers"
import { DraftPersistTimeoutError } from "@/lib/events/editor-v2-ux"
import {
  classifyPersistError,
  persistErrorUserMessage,
} from "@/lib/errors/persist-error"

describe("classifyPersistError", () => {
  it("labels Zod issues as validation errors", () => {
    const error = new ZodError([
      {
        code: "custom",
        path: ["tickets", 0, "name"],
        message: "Ingresá un nombre para el tipo de entrada.",
      },
    ])
    assert.equal(classifyPersistError(error), "zod")
    assert.equal(
      persistErrorUserMessage(error),
      "Ingresá un nombre para el tipo de entrada.",
    )
  })

  it("labels postgres / postgrest leaks as SQL", () => {
    assert.equal(classifyPersistError("PGRST204"), "sql")
    assert.equal(
      classifyPersistError({
        message: 'duplicate key value violates unique constraint "ticket_tiers_pkey"',
      }),
      "sql",
    )
    assert.equal(
      persistErrorUserMessage({
        code: "PGRST204",
        message: "Could not find the 'capacity' column",
        details: "schema cache",
      }),
      "[SUPABASE ERROR - Code: PGRST204]: Could not find the 'capacity' column. Details: schema cache",
    )
  })

  it("maps seating check violations to a readable persist message", () => {
    assert.equal(
      persistErrorUserMessage({
        code: "23514",
        message: "SEATING_SECTOR_NOT_FOUND",
      }),
      ORPHAN_SEATING_SECTOR_MESSAGE,
    )
  })

  it("maps the physical undated seating unique to a readable persist message", () => {
    assert.equal(
      persistErrorUserMessage(
        '[SUPABASE ERROR - Code: 23505]: duplicate key value violates unique constraint "event_seating_units_physical_undated_uidx". Details: Key (event_id, sector_id, layout_item_id)=(a81c76e1-6f7b-4c8e-b35d-125d9a8709be, grada-naranja, grada-naranja-r1-n1) already exists.',
      ),
      "Ese sector del mapa ya tiene una entrada para el mismo día. Revisá las jornadas o el nombre de la tarifa.",
    )
  })

  it("labels fetch failures as network", () => {
    assert.equal(classifyPersistError(new TypeError("Failed to fetch")), "network")
    assert.equal(classifyPersistError("ERR_NETWORK: load failed"), "network")
    assert.equal(
      classifyPersistError("net::ERR_NAME_NOT_RESOLVED"),
      "network",
    )
    assert.equal(
      persistErrorUserMessage(new TypeError("Failed to fetch")),
      "No pudimos conectar con el servidor. Recargá la página e intentá de nuevo.",
    )
  })

  it("keeps a hung draft persist as a retryable save error", () => {
    assert.equal(
      persistErrorUserMessage(new DraftPersistTimeoutError()),
      "Error al guardar. El servidor no respondió a tiempo. Reintentá.",
    )
  })
})
