import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatSupabaseError,
  isUnmaskedSupabaseError,
} from "@/lib/errors/supabase-error"
import {
  INVENTORY_SYNC_MESSAGE,
  toUserFacingError,
} from "@/lib/errors/user-facing-error"

describe("formatSupabaseError", () => {
  it("keeps code, message and details from a PostgREST error", () => {
    const formatted = formatSupabaseError({
      code: "PGRST204",
      message: "Could not find the 'capacity' column",
      details: "schema cache",
    })
    assert.equal(
      formatted,
      "[SUPABASE ERROR - Code: PGRST204]: Could not find the 'capacity' column. Details: schema cache",
    )
    assert.equal(isUnmaskedSupabaseError(formatted), true)
  })

  it("never shows an already formatted persist leak to the organizer", () => {
    const raw =
      "[SUPABASE ERROR - Code: 42501]: permission denied for table ticket_tiers. Details: RLS"
    assert.equal(toUserFacingError(raw), INVENTORY_SYNC_MESSAGE)
  })
})
