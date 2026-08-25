import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ZodError } from "zod"

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

  it("labels fetch failures as network", () => {
    assert.equal(classifyPersistError(new TypeError("Failed to fetch")), "network")
    assert.equal(classifyPersistError("ERR_NETWORK: load failed"), "network")
  })
})
