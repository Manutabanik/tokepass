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
})
