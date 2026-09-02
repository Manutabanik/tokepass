import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { IssuedTicketRow } from "@/lib/admin/issued-tickets"
import {
  audienceCsvFilename,
  buildAudienceCsv,
  withUtf8Bom,
} from "@/lib/admin/audience-csv"

function stubTicket(
  partial: Partial<IssuedTicketRow> & Pick<IssuedTicketRow, "status">,
): IssuedTicketRow {
  return {
    id: "t1",
    code: "ABCD",
    holderName: "María José",
    holderEmail: "maria@example.com",
    holderDni: "30111222",
    sectorLabel: "Campo General",
    checkedInAt: null,
    purchasedAt: "2026-08-13T15:30:00.000Z",
    ticketUrl: "https://tokepass.app/t/1",
    isTest: false,
    originalBuyer: {
      name: "María José",
      email: "maria@example.com",
      dni: "30111222",
    },
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
    ...partial,
  }
}

describe("audience csv", () => {
  it("builds UTF-8 friendly CSV and skips cancelled", () => {
    const csv = buildAudienceCsv([
      stubTicket({ status: "available" }),
      stubTicket({
        id: "t2",
        status: "cancelled",
        holderName: "Anulado",
      }),
      stubTicket({
        id: "t3",
        status: "checked_in",
        holderName: 'Pérez, "Juan"',
      }),
    ])

    assert.match(csv, /^Nombre del Titular,Email,DNI\/Documento/)
    assert.match(csv, /Válido/)
    assert.match(csv, /Ingresó/)
    assert.doesNotMatch(csv, /Anulado/)
    assert.match(csv, /"Pérez, ""Juan"""/)
  })

  it("adds BOM for Excel", () => {
    const withBom = withUtf8Bom("a,b")
    assert.equal(withBom.charCodeAt(0), 0xfeff)
  })

  it("builds safe filename", () => {
    assert.equal(
      audienceCsvFilename("Fiesta Nacional!", "abc"),
      "audiencia_evento_fiesta_nacional.csv",
    )
  })
})
