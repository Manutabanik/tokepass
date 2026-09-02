import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectLiveSeatingSectorIds,
  collectValidSectorIdsFromVenueMaps,
  isRelationalIntegrityError,
  isSeatingSectorRpcError,
  nullifyInvalidTicketSeatingSectors,
  ORPHAN_SEATING_SECTOR_MESSAGE,
  reconcileTicketTierIds,
  sanitizeDeepSeatingRefs,
  sanitizeEventSubmitPayload,
  sanitizeSeatingSectorIds,
  sanitizeTicketTiersForPersist,
  seatingPersistUserMessage,
} from "@/lib/events/sanitize-ticket-tiers"
import type { EventFormValues } from "@/lib/validations/event-form"
import { eventFormValues } from "@/tests/fixtures/event-form"
import { emptyVenueMap } from "@/types/venue-map"

function ticket(
  patch: Partial<EventFormValues["tickets"][number]>,
): EventFormValues["tickets"][number] {
  return {
    name: "General",
    price: 1000,
    basePrice: 1000,
    feeStrategy: "absorb_in_price",
    calculationMode: "public_price",
    capacity: 10,
    timeLimit: "",
    saleStartsAt: "",
    saleEndsAt: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
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

describe("nullifyInvalidTicketSeatingSectors", () => {
  it("anula seating_sector_id fantasma y degrada a general", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "grada-naranja",
        name: "Grada Naranja",
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
    const valid = collectValidSectorIdsFromVenueMaps({ venueMap: map })
    const next = nullifyInvalidTicketSeatingSectors(
      [
        {
          name: "Viva",
          seating_sector_id: "grada-naranja",
          layout_type: "numbered_seat",
          tier_type: "seated",
        },
        {
          name: "General",
          seating_sector_id: "grada-borrada",
          layout_type: "general",
          tier_type: "general",
        },
      ],
      valid,
    )
    assert.equal(next[0]?.seating_sector_id, "grada-naranja")
    assert.equal(next[0]?.layout_type, "numbered_seat")
    assert.equal(next[1]?.seating_sector_id, null)
    assert.equal(next[1]?.layout_type, "general")
    assert.throws(
      () =>
        nullifyInvalidTicketSeatingSectors(
          [
            {
              name: "Fantasma",
              seating_sector_id: "grada-borrada",
              layout_type: "numbered_seat",
              tier_type: "seated",
            },
          ],
          valid,
        ),
      /Fantasma/,
    )
  })

  it("lee IDs de seating_maps por jornada además del venue_map", () => {
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
    const ids = collectValidSectorIdsFromVenueMaps({
      seatingMaps: [{ map_config: map }],
    })
    assert.equal(ids.has("campo"), true)
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
      eventFormValues({
        basics: { title: "Test", hasSeatingPlan: true },
        venue: {
          venueName: "Lugar",
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
      }),
      { mode: "create" },
    )
    assert.equal(next.tickets[0]?.seatingSectorId, "campo")
    assert.equal(next.tickets[1]?.seatingSectorId, null)
  })

  it("desacopla una entrada general de un sector del mapa", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea-vip",
        name: "Platea VIP",
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
    const next = sanitizeEventSubmitPayload(
      eventFormValues({
        basics: { title: "Hibrido", hasSeatingPlan: true },
        venue: {
          venueName: "Predio",
          venueMap: map,
          includesSeatingMap: true,
          zones: [
            {
              id: "general:pista",
              name: "Pista",
              type: "general_admission",
              capacity: 200,
            },
          ],
        },
        tickets: [
          ticket({
            seatingSectorId: "platea-vip",
            layoutType: "general",
          }),
          ticket({
            seatingSectorId: "general:pista",
            layoutType: "general",
            name: "Campo",
          }),
        ],
      }),
      { mode: "create" },
    )
    assert.equal(next.tickets[0]?.seatingSectorId, null)
    assert.equal(next.tickets[1]?.seatingSectorId, "general:pista")
  })

  it("conserva sector_id de una zona GA del mapa visual", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
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
        capacity: 200,
        labelPrefix: "",
      },
    ]
    const next = sanitizeEventSubmitPayload(
      eventFormValues({
        basics: { title: "Mapa GA", hasSeatingPlan: true },
        venue: {
          venueName: "Predio",
          venueMap: map,
          includesSeatingMap: true,
        },
        tickets: [
          ticket({
            name: "Campo",
            seatingSectorId: "campo",
            layoutType: "general",
            tierType: "general",
          }),
        ],
      }),
      { mode: "create" },
    )
    assert.equal(next.tickets[0]?.seatingSectorId, "campo")
  })

  it("desacopla sectores si el mapa no está activado aunque quede JSON residual", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
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
        capacity: 200,
        labelPrefix: "",
      },
    ]
    const next = sanitizeEventSubmitPayload(
      eventFormValues({
        basics: { title: "Fiesta simple", hasSeatingPlan: true },
        venue: {
          venueName: "Club",
          includesSeatingMap: false,
          venueMap: map,
        },
        tickets: [
          ticket({
            seatingSectorId: "campo",
            layoutType: "general",
          }),
        ],
      }),
      { mode: "create" },
    )
    assert.equal(next.tickets[0]?.seatingSectorId, null)
  })

  it("deja seatingSectorId en null si el evento no tiene mapa", () => {
    const next = sanitizeEventSubmitPayload(
      eventFormValues({
        basics: { title: "Fiesta simple", hasSeatingPlan: false },
        venue: {
          venueName: "Club",
          includesSeatingMap: false,
        },
        tickets: [
          ticket({
            seatingSectorId: "general:pista",
            layoutType: "general",
          }),
        ],
      }),
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

describe("seatingPersistUserMessage", () => {
  it("traduce 23514 de sectores huérfanos a un mensaje legible", () => {
    assert.equal(isSeatingSectorRpcError("SEATING_SECTOR_NOT_FOUND"), true)
    assert.equal(
      seatingPersistUserMessage({
        code: "23514",
        message: "SEATING_SECTOR_NOT_FOUND",
      }),
      ORPHAN_SEATING_SECTOR_MESSAGE,
    )
    assert.equal(
      seatingPersistUserMessage(
        "[SUPABASE ERROR - Code: 23514]: SEATING_SECTOR_NOT_FOUND. Details: N/A",
      ),
      ORPHAN_SEATING_SECTOR_MESSAGE,
    )
    assert.equal(seatingPersistUserMessage("PGRST204"), null)
  })

  it("traduce un mapa que borra asientos vendidos al mensaje de inmutabilidad", () => {
    assert.equal(
      seatingPersistUserMessage({
        code: "23514",
        message: "SEATING_LAYOUT_SOLD_ITEM_REMOVED",
      }),
      "No puedes eliminar asientos con ventas activas. Mantenlo en el mapa y márcalo como 'bloqueado'.",
    )
  })

  it("traduce 23505 del unique de sector por día a un mensaje legible", () => {
    assert.equal(
      seatingPersistUserMessage(
        '[SUPABASE ERROR - Code: 23505]: duplicate key value violates unique constraint "ticket_tiers_event_sector_undated_key". Details: Key (event_id, seating_sector_id)=(a81c76e1-6f7b-4c8e-b35d-125d9a8709be, grada-amarilla) already exists.',
      ),
      "Ese sector del mapa ya tiene una entrada para el mismo día. Revisá las jornadas o el nombre de la tarifa.",
    )
  })

  it("traduce 23505 del asiento físico sin jornada a un mensaje legible", () => {
    assert.equal(
      seatingPersistUserMessage(
        '[SUPABASE ERROR - Code: 23505]: duplicate key value violates unique constraint "event_seating_units_physical_undated_uidx". Details: Key (event_id, sector_id, layout_item_id)=(a81c76e1-6f7b-4c8e-b35d-125d9a8709be, grada-naranja, grada-naranja-r1-n1) already exists.',
      ),
      "Ese sector del mapa ya tiene una entrada para el mismo día. Revisá las jornadas o el nombre de la tarifa.",
    )
  })

  it("traduce la colisión de dos tarifas en el mismo sector", () => {
    assert.equal(
      seatingPersistUserMessage({
        code: "23505",
        message: "SEATING_SECTOR_TIER_COLLISION",
      }),
      "Ese sector del mapa ya tiene una entrada para el mismo día. Revisá las jornadas o el nombre de la tarifa.",
    )
  })
})
