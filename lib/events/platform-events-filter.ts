export const PLATFORM_EVENT_FILTERS = [
  "activos",
  "solicitudes",
  "eliminados",
] as const

export type PlatformEventFilter = (typeof PLATFORM_EVENT_FILTERS)[number]

export function parsePlatformEventFilter(
  value?: string | null,
): PlatformEventFilter {
  if (value === "solicitudes" || value === "eliminados") return value
  return "activos"
}
