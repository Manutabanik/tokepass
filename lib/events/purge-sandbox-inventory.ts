export function sandboxOrderIdsFromTickets(
  rows: Array<{ order_id?: string | null }>,
): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row.order_id?.trim() ?? "")
        .filter((id) => id.length > 0),
    ),
  ]
}
