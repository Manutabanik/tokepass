import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  manifestTicketMatchesQuery,
  normalizeManifestCode,
  type ManifestSearchableTicket,
} from "@/lib/scanner/manifest-search"
import { ticketBackupCode } from "@/lib/ticket-print"

const TICKET_ID = "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"

function ticket(
  overrides: Partial<ManifestSearchableTicket> = {},
): ManifestSearchableTicket {
  return {
    id: TICKET_ID,
    owner_name: "Ana Gómez",
    dni: "30123456",
    ticket_tier: "General",
    ...overrides,
  }
}

describe("manifest manual search", () => {
  it("still matches name, dni and tier", () => {
    assert.equal(manifestTicketMatchesQuery(ticket(), "gómez"), true)
    assert.equal(manifestTicketMatchesQuery(ticket(), "30123"), true)
    assert.equal(manifestTicketMatchesQuery(ticket(), "general"), true)
    assert.equal(manifestTicketMatchesQuery(ticket(), "Pérez"), false)
  })

  it("matches the backup code printed under the QR", () => {
    const code = ticketBackupCode(TICKET_ID)
    assert.equal(code, "9DFCC6CA8D97")
    assert.equal(manifestTicketMatchesQuery(ticket(), code), true)
    assert.equal(manifestTicketMatchesQuery(ticket(), code.toLowerCase()), true)
  })

  it("accepts a dictated code with spaces or dashes", () => {
    assert.equal(manifestTicketMatchesQuery(ticket(), "9DFC C6CA 8D97"), true)
    assert.equal(manifestTicketMatchesQuery(ticket(), "9dfc-c6ca-8d97"), true)
  })

  it("accepts a prefix of the code and the full pasted uuid", () => {
    assert.equal(manifestTicketMatchesQuery(ticket(), "9dfcc6ca"), true)
    assert.equal(manifestTicketMatchesQuery(ticket(), TICKET_ID), true)
  })

  it("does not match a different ticket's code", () => {
    assert.equal(manifestTicketMatchesQuery(ticket(), "abcd1234"), false)
  })

  it("ignores code queries too short to be useful", () => {
    // Un prefijo de 3 caracteres devolvería medio manifiesto.
    assert.equal(manifestTicketMatchesQuery(ticket(), "9df"), false)
    assert.equal(manifestTicketMatchesQuery(ticket(), "9"), false)
  })

  it("tolerates a ticket without dni", () => {
    assert.equal(
      manifestTicketMatchesQuery(ticket({ dni: null }), "9dfcc6ca"),
      true,
    )
    assert.equal(manifestTicketMatchesQuery(ticket({ dni: null }), "301"), false)
  })

  it("normalizes what the staff types", () => {
    assert.equal(normalizeManifestCode(" 9DFC-C6CA 8D97 "), "9dfcc6ca8d97")
  })
})
