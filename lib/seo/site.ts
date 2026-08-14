const EVENT_TIME_ZONE = "America/Argentina/Buenos_Aires"
const ARGENTINA_OFFSET = "-03:00"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isEventUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export function getSeoOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    ""

  if (raw) {
    try {
      return new URL(raw).origin
    } catch {
      /* fall through */
    }
  }

  return "https://www.tokepass.com.ar"
}

export function publicEventPath(event: {
  slug?: string | null
  id: string
}): string {
  const slug = event.slug?.trim()
  return `/eventos/${slug || event.id}`
}

export function publicEventUrl(event: {
  slug?: string | null
  id: string
}): string {
  return `${getSeoOrigin()}${publicEventPath(event)}`
}

export function publicEventLoginPath(event: {
  slug?: string | null
  id: string
}): string {
  return `/login?next=${encodeURIComponent(publicEventPath(event))}`
}

export function toArgentinaIso8601(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00"

  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}:${read("second")}${ARGENTINA_OFFSET}`
}
