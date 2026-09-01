import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampZoneToPage,
  formatPrintFolioPreview,
  formatPrintSerialLabel,
  formatPrintSerialRange,
  isPrintBatchChannel,
  isPrintBatchMode,
  mmToScreenPx,
  moveZoneByMm,
  normalizePrintBatchName,
  normalizePrintSeriesCode,
  parseAccreditationCsv,
  parseTemplateLayout,
  printBatchChannelLabel,
  printBatchNeedsGuests,
  printBatchStatusLabel,
  printChannelUsesCommercialStock,
  printChannelUsesDigitalStock,
  printChannelUsesPhysicalStock,
  screenPxToMm,
} from "./print-studio"

describe("formatPrintSerialLabel", () => {
  it("builds A-00001 from series A and seq 1", () => {
    assert.equal(formatPrintSerialLabel("A", 1), "A-00001")
  })

  it("uppercases the series and pads five digits", () => {
    assert.equal(formatPrintSerialLabel("ab", 42), "AB-00042")
    assert.equal(formatPrintSerialLabel("VIP", 1000), "VIP-01000")
  })

  it("rejects a non-positive sequence", () => {
    assert.throws(() => formatPrintSerialLabel("A", 0), /INVALID_SEQ/)
    assert.throws(() => formatPrintSerialLabel("A", 1.5), /INVALID_SEQ/)
  })
})

describe("normalizePrintSeriesCode", () => {
  it("defaults to A and uppercases", () => {
    assert.equal(normalizePrintSeriesCode(null), "A")
    assert.equal(normalizePrintSeriesCode("  b2 "), "B2")
  })

  it("rejects symbols and long codes", () => {
    assert.equal(normalizePrintSeriesCode("A-1"), null)
    assert.equal(normalizePrintSeriesCode("ABCDEFGHI"), null)
  })
})

describe("print batch guards", () => {
  it("accepts known modes and channels", () => {
    assert.equal(isPrintBatchMode("unnamed"), true)
    assert.equal(isPrintBatchMode("accreditation"), true)
    assert.equal(isPrintBatchChannel("batch_print"), true)
    assert.equal(isPrintBatchChannel("online"), false)
  })

  it("requires guests only for named and seated modes", () => {
    assert.equal(printBatchNeedsGuests("named"), true)
    assert.equal(printBatchNeedsGuests("seated"), true)
    assert.equal(printBatchNeedsGuests("unnamed"), false)
    assert.equal(printBatchNeedsGuests("accreditation"), false)
  })

  it("validates the batch display name", () => {
    assert.equal(normalizePrintBatchName("A"), null)
    assert.equal(normalizePrintBatchName("Lote prensa"), "Lote prensa")
  })
})

describe("print studio preview math", () => {
  it("converts 1 mm to 3.7795 px at 96 DPI", () => {
    assert.ok(Math.abs(mmToScreenPx(1) - 3.779527559055118) < 0.0001)
    assert.ok(Math.abs(screenPxToMm(mmToScreenPx(150)) - 150) < 0.0001)
  })

  it("formats folio preview and ranges", () => {
    assert.equal(formatPrintFolioPreview("a", 1), "SERIE A - N° 00001")
    assert.equal(formatPrintSerialRange(1, 500), "00001 - 00500")
  })

  it("clamps dragged zones inside the page", () => {
    const moved = moveZoneByMm(
      { id: "qr", enabled: true, xMm: 140, yMm: 60, widthMm: 28, heightMm: 28 },
      20,
      20,
      150,
      70,
    )
    assert.equal(moved.xMm, 122)
    assert.equal(moved.yMm, 42)
    const clamped = clampZoneToPage(
      { id: "qr", enabled: true, xMm: -4, yMm: -2, widthMm: 200, heightMm: 90 },
      150,
      70,
    )
    assert.equal(clamped.widthMm, 150)
    assert.equal(clamped.heightMm, 70)
    assert.equal(clamped.xMm, 0)
    assert.equal(clamped.yMm, 0)
  })

  it("parses stored layout colors and keeps every zone", () => {
    const layout = parseTemplateLayout(
      {
        primaryColor: "#111111",
        zones: [{ id: "qr", enabled: false, xMm: 10, yMm: 12, widthMm: 20, heightMm: 20 }],
      },
      "press_sheet",
      150,
      70,
    )
    assert.equal(layout.primaryColor, "#111111")
    assert.equal(layout.zones.length, 8)
    assert.equal(layout.zones.find((zone) => zone.id === "qr")?.enabled, false)
  })
})

describe("accreditation csv", () => {
  it("reads headered staff rows", () => {
    const rows = parseAccreditationCsv(
      "nombre,dni,rol,empresa\nAna,30111222,Prensa,Radio X\n",
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.nombre, "Ana")
    assert.equal(rows[0]?.staffRole, "Prensa")
    assert.equal(rows[0]?.staffCompany, "Radio X")
  })
})

describe("print batch labels", () => {
  it("maps channel and status for the table", () => {
    assert.equal(printBatchChannelLabel("batch_print"), "Imprenta")
    assert.equal(printBatchStatusLabel("ready", 20), "Emitido")
    assert.equal(printBatchStatusLabel("ready", 0), "Listo")
    assert.equal(printBatchStatusLabel("draft", 0), "Borrador")
  })

  it("exempts accreditation from commercial stock", () => {
    assert.equal(printChannelUsesCommercialStock("accreditation"), false)
    assert.equal(printChannelUsesCommercialStock("batch_print"), true)
    assert.equal(printChannelUsesCommercialStock("complimentary"), true)
    assert.equal(printChannelUsesDigitalStock("batch_print"), false)
    assert.equal(printChannelUsesDigitalStock("complimentary"), true)
    assert.equal(printChannelUsesPhysicalStock("batch_print"), true)
    assert.equal(printChannelUsesPhysicalStock("complimentary"), false)
  })
})
