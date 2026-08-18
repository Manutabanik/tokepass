import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectLiveSeatingSectorIds,
  isRelationalIntegrityError,
  reconcileTicketTierIds,
  sanitizeDeepSeatingRefs,
  sanitizeEventSubmitPayload,
  sanitizeSeatingSectorIds,
  sanitizeTicketTiersForPersist,
} from "@/lib/events/sanitize-ticket-tiers"
import type { EventFormValues } from "@/lib/validations/event-form"
import { emptyVenueMap } from "@/types/venue-map"

function ticket(
  patch: Partial<EventFormValues["tickets"][number]>,
): EventFormValues["tickets"][number] {
  return {
    name: "General",
    price: 1000,
    capacity: 10,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
    tierType: "general",
    listPrice: null,
    bundleItems: [],
    bundleType: null,
    promoDiscountType: null,
    promoDiscountValue: 0,
    promoRequiredQty: 1,
    promoPayQty: 1,
    description: "",
    highlightBadge: null,
    phases: [],
    ...patch,
  }
}

describe("sanitizeTicketTiersForPersist", () => {
  it("en create elimina cualquier id de cliente", () => {
    const next = sanitizeTicketTiersForPersist(
      [ticket({ id: "11111111-1111-4111-8111-111111111111" })],
      { mode: "create" },
    )
    assert.equal(next[0]?.id, undefined)
    assert.equal(next[0]?.isNew, undefined)
  })

  it("en update respeta ids persistidos y limpia isNew / ids ajenos", () => {
    const persisted = "22222222-2222-4222-8222-222222222222"
    const ghost = "33333333-3333-4333-8333-333333333333"
    const next = sanitizeTicketTiersForPersist(
      [
        ticket({ id: persisted, name: "VIP" }),
        ticket({ id: ghost, name: "Fantasma" }),
        ticket({ isNew: true, id: "44444444-4444-4444-8444-444444444444", name: "Nueva" }),
      ],
      { mode: "update", persistedIds: [persisted] },
    )
    assert.equal(next[0]?.id, persisted)
    assert.equal(next[1]?.id, undefined)
    assert.equal(next[2]?.id, undefined)
  })
})

describe("reconcileTicketTierIds", () => {
  it("borra id si no existe en la DB del evento", () => {
    const live = "55555555-5555-4555-8555-555555555555"
    const next = reconcileTicketTierIds(
      [
        ticket({ id: live, name: "Viva" }),
        ticket({ id: "66666666-6666-4666-8666-666666666666", name: "Zombie" }),
        ticket({ name: "Sin id" }),
      ],
      [live],
    )
    assert.equal(next[0]?.id, live)
    assert.equal(next[1]?.id, undefined)
    assert.equal(next[2]?.id, undefined)
  })
})

describe("sanitizeSeatingSectorIds", () => {
  it("anula seatingSectorId que no está en el plano vivo", () => {
    const next = sanitizeSeatingSectorIds(
      [
        ticket({
          name: "Mesa",
          layoutType: "table_combo",
          seatingSectorId: "zone-viva",
        }),
        ticket({
          name: "Zombie",
          layoutType: "numbered_seat",
          seatingSectorId: "zone-borrada",
        }),
      ],
      ["zone-viva"],
    )
    assert.equal(next[0]?.seatingSectorId, "zone-viva")
    assert.equal(next[1]?.seatingSectorId, null)
  })

  it("lee sectores desde venue_map y seating_layout", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea",
        name: "Platea",
        color: "#f97316",
        price: 0,
        x: 10,
        y: 10,
        rows: 1,
        seatsPerRow: 1,
        curvature: 0,
        aisle: false,
        seats: [],
      },
    ]
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22d3ee",
        price: 0,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 10,
        labelPrefix: "",
      },
    ]
    const ids = collectLiveSeatingSectorIds({
      venueMap: map,
      seatingLayout: [{ id: "layout-vip" }],
      extraIds: ["mesa-1"],
    })
    assert.equal(ids.has("platea"), true)
    assert.equal(ids.has("campo"), true)
    assert.equal(ids.has("layout-vip"), true)
    assert.equal(ids.has("mesa-1"), true)
  })
})

describe("sanitizeDeepSeatingRefs", () => {
  it("anula FKs anidadas y no toca IDs del mapa", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea",
        name: "Platea",
        color: "#f97316",
        price: 0,
        x: 10,
        y: 10,
        rows: 1,
        seatsPerRow: 1,
        curvature: 0,
        aisle: false,
        seats: [],
      },
    ]
    const next = sanitizeDeepSeatingRefs(
      {
        venue: { venueMap: map, seatingLayout: [{ id: "layout-vip" }] },
        tickets: [
          { seatingSectorId: "platea", seating_sector_id: "fantasma" },
        ],
        extras: [{ seating_sector_id: "borrado", sectorKey: "platea" }],
      },
      ["platea"],
    )
    assert.equal(next.tickets[0]?.seatingSectorId, "platea")
    assert.equal(next.tickets[0]?.seating_sector_id, null)
    assert.equal(next.extras[0]?.seating_sector_id, null)
    assert.equal(next.extras[0]?.sectorKey, "platea")
    assert.equal(next.venue.venueMap.sectors[0]?.id, "platea")
    assert.equal(
      (next.venue.seatingLayout as Array<{ id: string }>)[0]?.id,
      "layout-vip",
    )
  })
})

describe("sanitizeEventSubmitPayload", () => {
  it("limpia seatingSectorId huérfano antes del submit", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22d3ee",
        price: 0,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 10,
        labelPrefix: "",
      },
    ]
    const next = sanitizeEventSubmitPayload(
      {
        basics: {
          title: "Test",
          date: "",
          endDate: "",
          description: "",
          flyerName: null,
          visibility: "public",
          isMultiDay: false,
          scheduleDays: [],
          categoryId: "",
          ageRestriction: "atp",
          hasSeatingPlan: true,
        },
        venue: {
          mode: "new",
          existingVenueId: null,
          zoneType: "general_admission",
          venueName: "Lugar",
          saveVenueForReuse: true,
          venueMap: map,
          includesSeatingMap: true,
        },
        tickets: [
          ticket({
            seatingSectorId: "campo",
            layoutType: "numbered_seat",
          }),
          ticket({
            seatingSectorId: "zona-borrada",
            layoutType: "numbered_seat",
          }),
        ],
        ticketsDefaultTab: "auto",
      } as EventFormValues,
      { mode: "create" },
    )
    assert.equal(next.tickets[0]?.seatingSectorId, "campo")
    assert.equal(next.tickets[1]?.seatingSectorId, null)
  })

  it("deja seatingSectorId en null si el evento no tiene mapa", () => {
    const next = sanitizeEventSubmitPayload(
      {
        basics: {
          title: "Fiesta simple",
          date: "",
          endDate: "",
          description: "",
          flyerName: null,
          visibility: "public",
          isMultiDay: false,
          scheduleDays: [],
          categoryId: "",
          ageRestriction: "atp",
          hasSeatingPlan: false,
        },
        venue: {
          mode: "new",
          existingVenueId: null,
          zoneType: "general_admission",
          venueName: "Club",
          saveVenueForReuse: true,
          includesSeatingMap: false,
        },
        tickets: [
          ticket({
            seatingSectorId: "general:pista",
            layoutType: "general",
          }),
        ],
        ticketsDefaultTab: "auto",
      } as EventFormValues,
      { mode: "create" },
    )
    assert.equal(next.tickets[0]?.seatingSectorId, null)
  })
})

describe("isRelationalIntegrityError", () => {
  it("detecta códigos de sector y violaciones FK", () => {
    assert.equal(isRelationalIntegrityError("SEATING_SECTOR_NOT_FOUND"), true)
    assert.equal(
      isRelationalIntegrityError(
        'insert into ticket_tiers violates foreign key constraint "event_seating_sectors"',
      ),
      true,
    )
    assert.equal(isRelationalIntegrityError("23503"), true)
    assert.equal(isRelationalIntegrityError("Completá el título."), false)
  })
})
