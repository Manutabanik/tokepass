export const EDITOR_PURGE_TEST_CONFIRM =
  "¿Deseas liberar todas las mesas ocupadas por compras de prueba?"

export const EDITOR_PURGE_TEST_LABEL = "🧪 Purgar Compras de Prueba"

export function eventStatusTreatsPurchasesAsDraft(
  status: string | null | undefined,
) {
  return status !== "published"
}

export function isEditorTestOrder(order: {
  is_test?: boolean | null
  environment?: string | null
}) {
  return order.is_test === true || order.environment === "test"
}

export function editorTestUnitIdsToRelease(
  units: ReadonlyArray<{
    id: string
    status?: string | null
    soldOrderId?: string | null
    reservedOrderId?: string | null
  }>,
  testOrderIds: Iterable<string>,
  eventStatus?: string | null,
): string[] {
  const tests = new Set(
    [...testOrderIds].map((id) => id.trim()).filter(Boolean),
  )
  const draftGenerated = eventStatusTreatsPurchasesAsDraft(eventStatus)
  return units
    .filter(
      (unit) => unit.status === "sold" || unit.status === "reserved",
    )
    .filter((unit) => {
      if (draftGenerated) return true
      return (
        (unit.soldOrderId != null && tests.has(unit.soldOrderId)) ||
        (unit.reservedOrderId != null && tests.has(unit.reservedOrderId))
      )
    })
    .map((unit) => unit.id)
}

export function editorTestTicketIdsToDelete(
  tickets: ReadonlyArray<{
    id: string
    isTest?: boolean | null
    orderId?: string | null
    seatingUnitId?: string | null
    seatId?: string | null
  }>,
  testOrderIds: Iterable<string>,
  eventStatus?: string | null,
): string[] {
  const tests = new Set(
    [...testOrderIds].map((id) => id.trim()).filter(Boolean),
  )
  const draftGenerated = eventStatusTreatsPurchasesAsDraft(eventStatus)
  return tickets
    .filter((ticket) => {
      if (ticket.isTest === true) return true
      if (ticket.orderId && tests.has(ticket.orderId)) return true
      if (!draftGenerated) return false
      return Boolean(ticket.seatingUnitId?.trim() || ticket.seatId?.trim())
    })
    .map((ticket) => ticket.id)
}
