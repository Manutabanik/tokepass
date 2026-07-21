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
})

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const eventDateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

const eventTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(new Date(value))
}

export function formatEventDate(value: string | Date): string {
  const date = new Date(value)
  const day = eventDateFormatter.format(date)
  const time = eventTimeFormatter.format(date)
  return `${day} · ${time}`
}

export function formatEventDay(value: string | Date): string {
  return eventDateFormatter.format(new Date(value))
}

export function formatEventTime(value: string | Date): string {
  return eventTimeFormatter.format(new Date(value))
}

/** Formato cartelera: "SAB 24 NOV" */
export function formatDiscoveryDate(value: string | Date): string {
  const date = new Date(value)
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase()
  const day = new Intl.DateTimeFormat("es-AR", { day: "2-digit" }).format(date)
  const month = new Intl.DateTimeFormat("es-AR", { month: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase()
  return `${weekday} ${day} ${month}`
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
