import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSeatingSummaryMinUuidError,
  seatingSummariesFromTicketTiers,
} from "./seating-sector-summary"

describe("seating-sector-summary", () => {
  it("detecta el error min(uuid) de Postgres", () => {
    assert.equal(
      isSeatingSummaryMinUuidError({
        message:
          '{"code":"42883","message":"function min(uuid) does not exist"}',
      }),
      true,
    )
    assert.equal(isSeatingSummaryMinUuidError({ message: "timeout" }), false)
  })

  it("arma resumen desde tickets sentados y omite general", () => {
    const rows = seatingSummariesFromTicketTiers([
      {
        id: "t-vip",
        name: "VIP",
        capacity: 20,
        sold: 5,
        layout_type: "table_combo",
        seating_sector_id: "zona-vip",
        capacity_per_unit: 4,
      },
      {
        id: "t-ga",
        name: "General",
        capacity: 100,
        sold: 10,
        layout_type: "general",
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.sectorId, "zona-vip")
    assert.equal(rows[0]?.available, 15)
    assert.equal(rows[0]?.sold, 5)
    assert.equal(rows[0]?.total, 20)
  })
})
