import type { FieldErrors } from "react-hook-form"

export const INVENTORY_SUPER_PANEL_IDS = ["tickets", "extras"] as const
export type InventorySuperPanelId = (typeof INVENTORY_SUPER_PANEL_IDS)[number]

export function inventorySuperPanelForFieldPath(
  path: Array<string | number> | string,
): InventorySuperPanelId {
  const root = Array.isArray(path)
    ? String(path[0] ?? "")
    : path.split(".")[0] ?? ""
  if (root === "extras") return "extras"
  return "tickets"
}

export function inventoryExtrasErrorsOpenPanel(
  errors: FieldErrors | undefined,
): boolean {
  return Boolean(errors?.extras && typeof errors.extras === "object")
}

export function resolveInventorySuperPanel(
  errors: FieldErrors | undefined,
  revealField?: string | null,
): InventorySuperPanelId {
  if (revealField?.trim()) {
    return inventorySuperPanelForFieldPath(revealField)
  }
  if (inventoryExtrasErrorsOpenPanel(errors)) return "extras"
  return "tickets"
}
