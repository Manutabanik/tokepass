import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  agendaIsoToTimeInput,
  canPersistAgendaBlock,
  collectAgendaParticipants,
  formatAgendaClockRange,
  mapAgendaBlock,
  moveAgendaItem,
  nextAgendaSlot,
  parseAgendaBlockDraft,
  resolveAgendaInstant,
  resolveAgendaWindow,
} from "@/lib/agenda"

describe("agenda universal", () => {
  it("acepta un bloque sin participante", () => {
    const parsed = parseAgendaBlockDraft({
      title: "Acreditaciones",
      startTime: "2026-11-14T09:00:00.000Z",
      endTime: "2026-11-14T10:00:00.000Z",
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(parsed.data.title, "Acreditaciones")
    assert.equal(parsed.data.participants, undefined)
  })

  it("acepta un day_id uuid y trata all como jornada única", () => {
    const withDay = parseAgendaBlockDraft({
      title: "Show",
      startTime: "09:00",
      endTime: "10:00",
      dayId: "11111111-1111-4111-8111-111111111111",
    })
    assert.equal(withDay.success, true)
    if (withDay.success) {
      assert.equal(withDay.data.dayId, "11111111-1111-4111-8111-111111111111")
    }

    const fullPass = parseAgendaBlockDraft({
      title: "Show",
      startTime: "09:00",
      endTime: "10:00",
      dayId: "all",
    })
    assert.equal(fullPass.success, true)
    if (fullPass.success) {
      assert.equal(fullPass.data.dayId, null)
    }

    const index = parseAgendaBlockDraft({
      title: "Show",
      startTime: "09:00",
      endTime: "10:00",
      dayId: "0",
    })
    assert.equal(index.success, true)
    if (index.success) {
      assert.equal(index.data.dayId, null)
    }
  })

  it("acepta un participante opcional o una lista vacía", () => {
    const withOne = parseAgendaBlockDraft({
      title: "Keynote",
      startTime: "2026-11-14T10:00:00.000Z",
      endTime: "2026-11-14T11:00:00.000Z",
      participant: { name: "Ana Pérez", roleTag: "CEO" },
    })
    assert.equal(withOne.success, true)
    if (withOne.success) {
      assert.equal(withOne.data.participants?.length, 1)
      assert.equal(withOne.data.participants?.[0]?.roleTag, "CEO")
    }

    const emptyList = collectAgendaParticipants({
      participant: null,
      participants: undefined,
    })
    assert.deepEqual(emptyList, [])
  })

  it("rechaza un bloque sin título o con cierre anterior al inicio", () => {
    const noTitle = parseAgendaBlockDraft({
      title: "   ",
      startTime: "2026-11-14T10:00:00.000Z",
      endTime: "2026-11-14T11:00:00.000Z",
    })
    assert.equal(noTitle.success, false)

    const inverted = resolveAgendaWindow({
      startTime: "2026-11-14T12:00:00.000Z",
      endTime: "2026-11-14T11:00:00.000Z",
      anchorIso: "2026-11-14T00:00:00.000Z",
    })
    assert.equal("error" in inverted, true)
  })

  it("resuelve HH:MM contra la jornada y cruza medianoche", () => {
    const start = resolveAgendaInstant("09:00", "2026-11-14T20:00:00.000Z")
    assert.ok(start)
    assert.equal(start?.getHours(), 9)

    const overnight = resolveAgendaWindow({
      startTime: "23:00",
      endTime: "01:00",
      anchorIso: "2026-11-14T20:00:00.000Z",
    })
    assert.equal("error" in overnight, false)
    if ("error" in overnight) return
    assert.ok(overnight.end.getTime() > overnight.start.getTime())
  })

  it("mapea participantes vacíos como array vacío", () => {
    const dto = mapAgendaBlock({
      id: "11111111-1111-4111-8111-111111111111",
      event_id: "22222222-2222-4222-8222-222222222222",
      day_id: null,
      title: "Acreditaciones",
      start_time: "2026-11-14T09:00:00.000Z",
      end_time: "2026-11-14T10:00:00.000Z",
      sort_order: 0,
      agenda_participants: [],
    })
    assert.equal(dto.participants.length, 0)
    assert.equal(dto.order, 0)
    assert.equal(dto.dayId, null)
  })

  it("convierte ISO a HH:MM y no persiste bloques incompletos", () => {
    assert.equal(agendaIsoToTimeInput("09:05"), "09:05")
    assert.match(agendaIsoToTimeInput("2026-11-14T12:30:00.000-03:00"), /^\d{2}:\d{2}$/)
    assert.equal(canPersistAgendaBlock({
      title: "",
      startTime: "09:00",
      endTime: "10:00",
    }), false)
    assert.equal(canPersistAgendaBlock({
      title: "Acreditaciones",
      startTime: "09:00",
      endTime: "10:00",
    }), true)
    assert.equal(formatAgendaClockRange("09:00", "10:30"), "09:00 – 10:30")
    assert.deepEqual(nextAgendaSlot([]), { startTime: "09:00", endTime: "10:00" })
    assert.deepEqual(nextAgendaSlot([{ endTime: "11:00" }]), {
      startTime: "11:00",
      endTime: "12:00",
    })
    assert.deepEqual(
      moveAgendaItem(
        [{ clientId: "a" }, { clientId: "b" }, { clientId: "c" }],
        "c",
        "a",
      ).map((item) => item.clientId),
      ["c", "a", "b"],
    )
  })
})
