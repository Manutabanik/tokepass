import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  layoutHoldSectorCandidates,
  pickSeatingUnitForLayoutHold,
} from "./layout-hold-unit"

describe("layout-hold-unit", () => {
  it("prueba el sector enviado y el id del lugar", () => {
    assert.deepEqual(layoutHoldSectorCandidates("zona-naranja", "mesa-1"), [
      "zona-naranja",
      "mesa-1",
    ])
    assert.deepEqual(layoutHoldSectorCandidates("mesa-1", "mesa-1"), ["mesa-1"])
    assert.deepEqual(
      layoutHoldSectorCandidates("grupo-mesas", "mesa-1", [
        "sector-naranja",
        "grupo-mesas",
      ]),
      ["grupo-mesas", "mesa-1", "sector-naranja"],
    )
  })

  it("elige la unidad del sector pedido y si no, la primera libre", () => {
    const units = [
      { id: "u-a", status: "available", sector_id: "grupo-mesas" },
      { id: "u-b", status: "available", sector_id: "zona-naranja" },
    ]
    assert.equal(
      pickSeatingUnitForLayoutHold(units, "zona-naranja")?.id,
      "u-b",
    )
    assert.equal(pickSeatingUnitForLayoutHold(units, "otro")?.id, "u-a")
  })

  it("ignora unidades vendidas si hay otra libre", () => {
    const units = [
      { id: "sold", status: "sold", sector_id: "grupo-mesas" },
      { id: "free", status: "available", sector_id: "grupo-mesas" },
    ]
    assert.equal(pickSeatingUnitForLayoutHold(units, "grupo-mesas")?.id, "free")
  })

  it("does not pick a seat from another jornada", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const units = [
      { id: "u-a", status: "available", sector_id: "platea", event_date_id: dayA },
      { id: "u-b", status: "available", sector_id: "platea", event_date_id: dayB },
    ]
    assert.equal(pickSeatingUnitForLayoutHold(units, "platea", dayB)?.id, "u-b")
    assert.equal(pickSeatingUnitForLayoutHold(units, "platea", dayA)?.id, "u-a")
  })

  it("does not pick an undated unit on a multi-day event", () => {
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const units = [
      { id: "u-undated", status: "available", sector_id: "platea" },
    ]
    assert.equal(
      pickSeatingUnitForLayoutHold(units, "platea", dayB, {
        scheduleDayCount: 2,
      }),
      null,
    )
  })
})
