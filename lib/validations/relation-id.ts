import { z } from "zod"

export const RELATION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function emptyToNull(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === "string" && value.trim() === "") return null
  return value
}

export function asUuidOrNull(
  value: unknown,
  aliases: readonly string[] = ["all"],
): string | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw || aliases.includes(raw)) return null
  return RELATION_UUID_RE.test(raw) ? raw : null
}

export const optionalUuid = z.preprocess(
  (value) => asUuidOrNull(value, []),
  z.string().uuid().nullable().optional(),
)

export const optionalDayId = z.preprocess(
  (value) => asUuidOrNull(value, ["all"]),
  z.string().uuid().nullable().optional(),
)

export const optionalSectorKey = z.preprocess((value) => {
  const next = emptyToNull(value)
  return typeof next === "string" ? next.trim() : next
}, z.string().min(1).nullable().optional())
