import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { renderAdmissionTicketPdf } from "@/lib/pdf/render-ticket-pdf"
import {
  mapPrintableTicketToPdfModel,
  parseTicketPdfIds,
  parseTicketPdfSize,
  THERMAL_58_WIDTH_PT,
  THERMAL_80_WIDTH_PT,
  ticketPdfFilename,
  ticketPdfPath,
  ticketPdfSectorName,
  type TicketPdfSource,
} from "@/lib/pdf/ticket-pdf-model"

const sample: TicketPdfSource = {
  id: "67f354ee-8d97-4d9c-951d-ffabc21e6210",
  qrPayload: "TPS.67f354ee-8d97-4d9c-951d-ffabc21e6210.deadbeef",
  eventTitle: "Noche en Palermo",
  eventDate: "2026-08-21T23:00:00.000-03:00",
  eventLocation: "Niceto  · Palermo",
  tierName: "Entrada General",
  holderName: "Ana Perez",
  holderDni: "30111222",
  tierPrice: 15000,
  flyerUrl: null,
  sectorLabel: "Campo",
  seatingLabel: "Campo",
  isTest: false,
}

describe("ticket pdf model", () => {
  it("parses page formats and keeps 80mm as default", () => {
    assert.equal(parseTicketPdfSize("58mm"), "58mm")
    assert.equal(parseTicketPdfSize("a4"), "a4")
    assert.equal(parseTicketPdfSize("letter"), "80mm")
    assert.equal(parseTicketPdfSize(null), "80mm")
  })

  it("uses exact thermal widths in PDF points", () => {
    assert.equal(THERMAL_80_WIDTH_PT, 226.77)
    assert.equal(THERMAL_58_WIDTH_PT, 164.4)
  })

  it("dedupes batch ids and always includes the path id", () => {
    assert.deepEqual(
      parseTicketPdfIds("aaa", "bbb,aaa,ccc"),
      ["aaa", "bbb", "ccc"],
    )
  })

  it("builds the public pdf path without nested query noise", () => {
    assert.equal(
      ticketPdfPath("abc"),
      "/api/tickets/abc/pdf",
    )
    assert.equal(
      ticketPdfPath("abc", { size: "a4", download: true, ids: ["abc", "def"] }),
      "/api/tickets/abc/pdf?size=a4&ids=abc%2Cdef&download=1",
    )
  })

  it("maps door copy, sector and audit without inventing a QR scheme", () => {
    const model = mapPrintableTicketToPdfModel(
      sample,
      {
        orderId: "abcd1234-ffff-4000-8000-000000000001",
        paymentMethod: "cash_pos",
        issuedAt: "2026-08-21T20:15:00.000-03:00",
      },
      { qrDataUri: "data:image/png;base64,xx", eventFlyerSrc: null },
    )
    assert.equal(model.ticketCode, "#67F354EE")
    assert.equal(model.sectorName, "Campo")
    assert.equal(model.paymentMethod, "EFECTIVO")
    assert.equal(model.orderIdShort, "ABCD1234")
    assert.equal(model.qrPayload, sample.qrPayload)
    assert.equal(model.qrDataUri, "data:image/png;base64,xx")
    assert.match(model.ticketPrice ?? "", /15/)
  })

  it("omits sector when it only repeats the tier name", () => {
    assert.equal(
      ticketPdfSectorName({
        ...sample,
        sectorLabel: null,
        seatingLabel: null,
      }),
      null,
    )
  })

  it("names the file from the short door code", () => {
    assert.equal(ticketPdfFilename(sample.id), "ticket-67F354EE.pdf")
  })

  it("renders a vector PDF that starts with the PDF header", async () => {
    const pdf = await renderAdmissionTicketPdf({
      tickets: [sample],
      format: "80mm",
    })
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF")
  })
})
