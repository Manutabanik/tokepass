import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyEventDraftV2 } from "@/lib/validations/event-draft-v2"

import {
  cheapestDraftTicketPrice,
  draftLaunchChecklist,
  draftLaunchPreview,
  draftLaunchPreviewLabel,
  draftLaunchSubmitLabel,
  isDraftLaunchReady,
  simulateDraftSale,
} from "./launch-center-v2"

describe("cheapestDraftTicketPrice", () => {
  it("returns the lowest ticket price and ignores empty lists", () => {
    assert.equal(cheapestDraftTicketPrice([]), null)
    assert.equal(
      cheapestDraftTicketPrice([
        { price: 18000 },
        { price: "9000" },
        { price: 12000 },
      ]),
      9000,
    )
    assert.equal(
      cheapestDraftTicketPrice(
        [
          { price: 18000, name: "General" },
          {
            price: 0,
            name: "Mesa",
            source: "map",
            sectorId: "mesa-1",
          },
        ],
        { hasMap: false },
      ),
      18000,
    )
  })
})

describe("simulateDraftSale", () => {
  it("adds the 10% fee to the customer when the organizer does not absorb", () => {
    const sale = simulateDraftSale(10000, false, 0.1)
    assert.deepEqual(sale, {
      ticketPrice: 10000,
      feeAmount: 1000,
      absorbFees: false,
      customerPays: 11000,
      organizerReceives: 10000,
    })
  })

  it("subtracts the 10% fee from the organizer when absorbFees is true", () => {
    const sale = simulateDraftSale(10000, true, 0.1)
    assert.deepEqual(sale, {
      ticketPrice: 10000,
      feeAmount: 1000,
      absorbFees: true,
      customerPays: 10000,
      organizerReceives: 9000,
    })
  })
})

describe("draftLaunchChecklist", () => {
  it("turns green only when name, start date, a ticket and capacity are set", () => {
    const empty = draftLaunchChecklist(emptyEventDraftV2())
    assert.deepEqual(
      empty.map((item) => [item.id, item.ok]),
      [
        ["identity", false],
        ["tickets", false],
        ["capacity", false],
      ],
    )
    assert.equal(isDraftLaunchReady(emptyEventDraftV2()), false)
    assert.equal(
      draftLaunchChecklist({
        basicInfo: { name: "After", startDate: "2026-09-01T22:00" },
        schedule: [
          {
            id: "day-1",
            name: "Día 1",
            startDate: "2026-09-01T22:00",
            endDate: "",
          },
        ],
        venueCapacity: 200,
        tickets: [{ name: "General", price: 10000, stock: 10 }],
      }).find((item) => item.id === "identity")?.ok,
      true,
    )
    assert.equal(
      draftLaunchChecklist({
        hasMap: false,
        tickets: [
          {
            name: "Platea",
            price: 0,
            stock: 40,
            source: "map",
            sectorId: "sector-1",
          },
        ],
      }).find((item) => item.id === "tickets")?.ok,
      false,
    )

    const ready = {
      ...emptyEventDraftV2(),
      basicInfo: {
        name: "After",
        startDate: "2026-09-01T22:00",
        endDate: "2026-09-02T04:00",
        locationName: "Niceto",
      },
      location: {
        venueName: "Niceto",
        address: "Av. Córdoba 1234, CABA",
        province: "CABA",
        city: "CABA",
      },
      schedule: [
        {
          id: "day-1",
          name: "Día 1",
          startDate: "2026-09-01T22:00",
          endDate: "2026-09-02T04:00",
        },
      ],
      venueCapacity: 200,
      tickets: [{ id: "t1", name: "General", price: 10000, stock: 80 }],
    }
    assert.equal(isDraftLaunchReady(ready), true)
    assert.equal(
      draftLaunchChecklist(ready).every((item) => item.ok),
      true,
    )
  })
})

describe("draftLaunchPreview", () => {
  it("reads name, first date, flyer and cheapest ticket", () => {
    const preview = draftLaunchPreview({
      basicInfo: {
        name: "After",
        startDate: "2026-09-01T22:00",
        locationName: "Niceto",
      },
      flyerUrl: "https://cdn.example/flyer.jpg",
      bannerUrl: "https://cdn.example/banner.jpg",
      tickets: [{ price: 18000 }, { price: 9000 }],
    })
    assert.equal(preview.name, "After")
    assert.equal(preview.startDate, "2026-09-01T22:00")
    assert.equal(preview.imageUrl, "https://cdn.example/flyer.jpg")
    assert.equal(preview.locationName, "Niceto")
    assert.equal(preview.minPrice, 9000)
  })

  it("shows the all-in public price when the buyer pays the fee", () => {
    const preview = draftLaunchPreview(
      {
        tickets: [{ price: 15000 }],
        settings: { absorbFees: false },
      },
      { rate: 0.08, fixedFee: 200 },
    )
    assert.equal(preview.minPrice, 16400)
  })

  it("keeps the base price when the organizer absorbs the fee", () => {
    const preview = draftLaunchPreview(
      {
        tickets: [{ price: 15000 }],
        settings: { absorbFees: true },
      },
      { rate: 0.08, fixedFee: 200 },
    )
    assert.equal(preview.minPrice, 15000)
  })
})

describe("draftLaunchSubmitLabel", () => {
  it("switches copy for draft vs published events", () => {
    assert.equal(draftLaunchSubmitLabel(false, false), "Subir al catálogo")
    assert.equal(draftLaunchSubmitLabel(true, false), "Actualizar catálogo")
    assert.equal(draftLaunchSubmitLabel(false, true), "Subiendo al catálogo...")
    assert.equal(draftLaunchSubmitLabel(true, true), "Actualizando...")
  })
})

describe("draftLaunchPreviewLabel", () => {
  it("keeps catalog events off the draft-save path", () => {
    assert.equal(
      draftLaunchPreviewLabel(false, false),
      "Guardar y probar borrador",
    )
    assert.equal(draftLaunchPreviewLabel(true, false), "Ver como comprador")
    assert.equal(draftLaunchPreviewLabel(false, true), "Guardando borrador...")
  })
})
