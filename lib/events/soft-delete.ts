/** p166 adds `events.is_deleted`. Older remotes still 42703 until that migration runs. */
export function isMissingIsDeletedColumn(message?: string | null): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return (
    text.includes("is_deleted") &&
    (text.includes("42703") ||
      text.includes("pgrst204") ||
      text.includes("schema cache") ||
      text.includes("does not exist") ||
      text.includes("column"))
  )
}

export function withActiveEvents<
  T extends { eq: (column: "is_deleted", value: false) => T },
>(query: T, hideDeleted: boolean): T {
  return hideDeleted ? query.eq("is_deleted", false) : query
}
