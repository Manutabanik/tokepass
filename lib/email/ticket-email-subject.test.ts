import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  SANDBOX_TICKET_EMAIL_PREFIX,
  ticketConfirmationEmailSubject,
} from "./ticket-email-subject"

describe("ticketConfirmationEmailSubject", () => {
  it("keeps the live subject unchanged", () => {
    assert.equal(
      ticketConfirmationEmailSubject("Fiesta Lunar"),
      "¡Acá están tus entradas para Fiesta Lunar!",
    )
  })

  it("prefixes sandbox receipts", () => {
    assert.equal(
      ticketConfirmationEmailSubject("Fiesta Lunar", { isTest: true }),
      `${SANDBOX_TICKET_EMAIL_PREFIX} ¡Acá están tus entradas para Fiesta Lunar!`,
    )
  })
})
