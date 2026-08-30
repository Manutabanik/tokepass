import type { InteractiveVenueMap } from "@/types/venue-map"

export type VenueMapBackgroundPatch = Partial<
  Pick<
    InteractiveVenueMap,
    | "backgroundImage"
    | "backgroundOpacity"
    | "backgroundScale"
    | "backgroundX"
    | "backgroundY"
  >
>

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function readImage(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const next = value.trim()
  return next ? next : null
}

/** Normalize background fields. Returns null when the map is missing. */
export function normalizeVenueMapBackgroundPatch(
  map: InteractiveVenueMap | null | undefined,
  patch: VenueMapBackgroundPatch,
): VenueMapBackgroundPatch | null {
  if (!map) return null
  const next: VenueMapBackgroundPatch = {}
  if ("backgroundImage" in patch) {
    next.backgroundImage = readImage(patch.backgroundImage)
  }
  if ("backgroundOpacity" in patch) {
    next.backgroundOpacity = clamp(Number(patch.backgroundOpacity), 0, 1, 0.4)
  }
  if ("backgroundScale" in patch) {
    next.backgroundScale = clamp(Number(patch.backgroundScale), 0.2, 2.5, 1)
  }
  if ("backgroundX" in patch) {
    next.backgroundX = clamp(Number(patch.backgroundX), -4000, 4000, 0)
  }
  if ("backgroundY" in patch) {
    next.backgroundY = clamp(Number(patch.backgroundY), -4000, 4000, 0)
  }
  return next
}

export function applyVenueMapBackgroundPatch(
  map: InteractiveVenueMap | null | undefined,
  patch: VenueMapBackgroundPatch,
): InteractiveVenueMap | null {
  const normalized = normalizeVenueMapBackgroundPatch(map, patch)
  if (!map || !normalized) return null
  return { ...map, ...normalized }
}
