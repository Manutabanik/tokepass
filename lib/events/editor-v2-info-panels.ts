import type { FieldErrors } from "react-hook-form"

export const INFO_SUPER_PANEL_IDS = ["identity", "logistics"] as const
export type InfoSuperPanelId = (typeof INFO_SUPER_PANEL_IDS)[number]

const LOGISTICS_ROOTS = new Set([
  "location",
  "schedule",
  "isVirtual",
  "virtualLink",
])

export function infoSuperPanelForFieldPath(
  path: Array<string | number> | string,
): InfoSuperPanelId {
  const parts = Array.isArray(path) ? path.map(String) : path.split(".")
  const root = parts[0] ?? ""
  if (root === "basicInfo" && parts[1] === "locationName") return "logistics"
  if (LOGISTICS_ROOTS.has(root)) return "logistics"
  return "identity"
}

export function infoLocationErrorsOpenLogistics(
  errors: FieldErrors | undefined,
): boolean {
  if (!errors) return false
  if (errors.location && typeof errors.location === "object") return true
  const locationName = (
    errors.basicInfo as { locationName?: { message?: unknown } } | undefined
  )?.locationName
  return typeof locationName?.message === "string" && Boolean(locationName.message.trim())
}

export function resolveInfoSuperPanel(
  errors: FieldErrors | undefined,
  revealField?: string | null,
): InfoSuperPanelId {
  if (revealField?.trim()) {
    return infoSuperPanelForFieldPath(revealField)
  }
  if (infoLocationErrorsOpenLogistics(errors)) return "logistics"
  return "identity"
}
