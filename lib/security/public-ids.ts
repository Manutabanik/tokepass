const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_ANY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INTEGER_ID = /^\d+$/

/** Public order/ticket/event keys must be UUID, never autoincrement integers. */
export function isPublicEntityId(value: string | null | undefined): boolean {
  const id = value?.trim() ?? ""
  if (!id || INTEGER_ID.test(id)) return false
  return UUID_ANY.test(id)
}

export function isUuidV4(value: string | null | undefined): boolean {
  return UUID_V4.test(value?.trim() ?? "")
}

export function assertPublicEntityId(value: string, label = "id"): string {
  const id = value.trim()
  if (!isPublicEntityId(id)) {
    throw new Error(`${label} público inválido`)
  }
  return id
}
