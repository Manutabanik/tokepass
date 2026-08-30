import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  deriveEventSaleState,
  isPastEvent,
  isSoldOut,
  resolveEventEndAt,
  resolveEventStartAt,
} from "@/lib/event-status"

describe("event-status", () => {
  const days = [
    {
      id: "d1",
      title: "Noche 1",
      start_time: "2026-08-10T22:00:00.000Z",
      end_time: "2026-08-11T06:00:00.000Z",
    },
    {
      id: "d2",
      title: "Noche 2",
      start_time: "2026-08-11T22:00:00.000Z",
      end_time: "2026-08-12T06:00:00.000Z",
    },
  ]

  it("usa el inicio de la primera jornada", () => {
    const start = resolveEventStartAt({
      date: "2026-08-10T22:00:00.000Z",
      scheduleDays: days,
    })
    assert.equal(start?.toISOString(), "2026-08-10T22:00:00.000Z")
  })

  it("usa el cierre de la última jornada", () => {
    const end = resolveEventEndAt({
      date: "2026-08-10T22:00:00.000Z",
      endsAt: "2026-08-11T04:00:00.000Z",
      scheduleDays: days,
    })
    assert.equal(end?.toISOString(), "2026-08-12T06:00:00.000Z")
  })

  it("marca finalizado después del last end", () => {
    assert.equal(
      isPastEvent(
        { date: "2026-08-10T22:00:00.000Z", scheduleDays: days },
        new Date("2026-08-12T06:00:01.000Z"),
      ),
      true,
    )
    assert.equal(
      isPastEvent(
        { date: "2026-08-10T22:00:00.000Z", scheduleDays: days },
        new Date("2026-08-12T05:59:00.000Z"),
      ),
      false,
    )
  })

  it("usa ends_at en jornada única", () => {
    assert.equal(
      isPastEvent(
        {
          date: "2026-08-13T22:00:00.000Z",
          endsAt: "2026-08-14T06:00:00.000Z",
        },
        new Date("2026-08-14T07:00:00.000Z"),
      ),
      true,
    )
  })

  it("detecta agotado por ticketsLeft y por tiers públicos", () => {
    assert.equal(isSoldOut({ ticketsLeft: 0 }), true)
    assert.equal(isSoldOut({ ticketsLeft: 3 }), false)
    assert.equal(
      isSoldOut({
        tiers: [
          { capacity: 100, sold: 100, visibility: "public" },
          { capacity: 20, sold: 0, visibility: "private" },
        ],
      }),
      true,
    )
    assert.equal(
      isSoldOut({
        tiers: [
          { capacity: 100, sold: 100, visibility: "public", tier_type: "general" },
          { capacity: 40, sold: 0, visibility: "public", ticket_type: "extra" },
        ],
      }),
      true,
    )
    assert.equal(
      isSoldOut({
        tiers: [
          { capacity: 20, sold: 0, visibility: "public", ticket_type: "extra" },
        ],
      }),
      true,
    )
  })

  it("prioriza finalizado sobre agotado", () => {
    assert.equal(
      deriveEventSaleState(
        {
          date: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-01-01T04:00:00.000Z",
          ticketsLeft: 0,
        },
        new Date("2026-01-02T00:00:00.000Z"),
      ),
      "finished",
    )
  })
})
