const EVENT_TIME_ZONE = "America/Argentina/Buenos_Aires"

function normalizeIntlOutput(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ")
}

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  notation: "compact",
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat("es-AR")

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: EVENT_TIME_ZONE,
})

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: EVENT_TIME_ZONE,
})

const eventDateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: EVENT_TIME_ZONE,
})

const eventTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: EVENT_TIME_ZONE,
})

export function formatCurrency(value: number): string {
  return normalizeIntlOutput(currencyFormatter.format(value))
}

export function formatCompactCurrency(value: number): string {
  return normalizeIntlOutput(compactCurrencyFormatter.format(value))
}

export function formatNumber(value: number): string {
  return normalizeIntlOutput(numberFormatter.format(value))
}

export function formatDate(value: string | Date): string {
  return normalizeIntlOutput(dateFormatter.format(new Date(value)))
}

export function formatDateTime(value: string | Date): string {
  return normalizeIntlOutput(dateTimeFormatter.format(new Date(value)))
}

export function formatEventDate(value: string | Date): string {
  const date = new Date(value)
  const day = normalizeIntlOutput(eventDateFormatter.format(date))
  const time = normalizeIntlOutput(eventTimeFormatter.format(date))
  return `${day} · ${time}`
}

export function formatEventDay(value: string | Date): string {
  return normalizeIntlOutput(eventDateFormatter.format(new Date(value)))
}

export function formatEventTime(value: string | Date): string {
  return normalizeIntlOutput(eventTimeFormatter.format(new Date(value)))
}

/** Formato cartelera: "SAB 24 NOV" */
export function formatDiscoveryDate(value: string | Date): string {
  const date = new Date(value)
  const weekday = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    timeZone: EVENT_TIME_ZONE,
  })
    .format(date)
    .replace(".", "")
    .toUpperCase()
  const day = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(date)
  const month = new Intl.DateTimeFormat("es-AR", {
    month: "short",
    timeZone: EVENT_TIME_ZONE,
  })
    .format(date)
    .replace(".", "")
    .toUpperCase()
  return `${weekday} ${day} ${month}`
}

/** Formato card: "SÁB 15 AGO • 23:30 HS" */
export function formatDiscoveryDateTime(value: string | Date): string {
  const date = new Date(value)
  const dayPart = formatDiscoveryDate(date)
  const time = normalizeIntlOutput(
    eventTimeFormatter.format(date),
  ).replace(/\s/g, "")
  return `${dayPart} • ${time} HS`
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`
}

export function getInitials(name: string | null, fallback: string): string {
  const source = name?.trim() || fallback
  return (
    source
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  )
}
