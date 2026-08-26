const EVENT_TIME_ZONE = "America/Argentina/Buenos_Aires"

function normalizeIntlOutput(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ")
}

function toValidDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatOrEmpty(
  value: string | Date,
  format: (date: Date) => string,
): string {
  const date = toValidDate(value)
  if (!date) return ""
  return format(date)
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

export function formatCurrency(
  value: number,
  options?: { freeLabel?: boolean },
): string {
  if (options?.freeLabel && Number.isFinite(value) && value === 0) {
    return "Gratis"
  }
  return normalizeIntlOutput(currencyFormatter.format(value))
}

/** Precio de entrada al público. Cero se muestra como Gratis. */
export function formatTicketPrice(value: number): string {
  return formatCurrency(value, { freeLabel: true })
}

export function formatCompactCurrency(value: number): string {
  return normalizeIntlOutput(compactCurrencyFormatter.format(value))
}

export function formatNumber(value: number): string {
  return normalizeIntlOutput(numberFormatter.format(value))
}

export function formatDate(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    normalizeIntlOutput(dateFormatter.format(date)),
  )
}

export function formatDateTime(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    normalizeIntlOutput(dateTimeFormatter.format(date)),
  )
}

export function formatEventDate(value: string | Date): string {
  return formatOrEmpty(value, (date) => {
    const day = normalizeIntlOutput(eventDateFormatter.format(date))
    const time = normalizeIntlOutput(eventTimeFormatter.format(date))
    return `${day} · ${time}`
  })
}

export function formatEventDay(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    normalizeIntlOutput(eventDateFormatter.format(date)),
  )
}

export function formatEventTime(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    normalizeIntlOutput(eventTimeFormatter.format(date)),
  )
}

export function formatEventWeekdayLong(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    titleCaseShortToken(
      new Intl.DateTimeFormat("es-AR", {
        weekday: "long",
        timeZone: EVENT_TIME_ZONE,
      }).format(date),
    ),
  )
}

export function formatEventWeekdayShort(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    new Intl.DateTimeFormat("es-AR", {
      weekday: "short",
      timeZone: EVENT_TIME_ZONE,
    })
      .format(date)
      .replace(".", "")
      .toUpperCase()
      .slice(0, 3),
  )
}

export function formatEventDayNumber(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      timeZone: EVENT_TIME_ZONE,
    }).format(date),
  )
}

/** Formato de píldora: "05/7" (día con cero, mes sin cero). */
export function formatEventDayMonthNumeric(value: string | Date): string {
  return formatOrEmpty(value, (date) => {
    const day = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      timeZone: EVENT_TIME_ZONE,
    }).format(date)
    const month = new Intl.DateTimeFormat("es-AR", {
      month: "numeric",
      timeZone: EVENT_TIME_ZONE,
    }).format(date)
    return `${day}/${month}`
  })
}

export function formatEventMonthShort(value: string | Date): string {
  return formatOrEmpty(value, (date) =>
    new Intl.DateTimeFormat("es-AR", {
      month: "short",
      timeZone: EVENT_TIME_ZONE,
    })
      .format(date)
      .replace(".", "")
      .toUpperCase()
      .slice(0, 3),
  )
}

function titleCaseShortToken(value: string): string {
  const token = value.trim()
  if (!token) return ""
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

/** Carrito y confirmación: "Jue 12 Nov" */
export function formatEventCartDate(value: string | Date): string {
  const weekday = titleCaseShortToken(formatEventWeekdayShort(value))
  const day = formatEventDayNumber(value)
  const month = titleCaseShortToken(formatEventMonthShort(value))
  return [weekday, day, month].filter(Boolean).join(" ")
}

/** Desglose enriquecido: "Viernes 13 Nov" */
export function formatEventCartDateLong(value: string | Date): string {
  const weekday = formatEventWeekdayLong(value)
  const day = formatEventDayNumber(value)
  const month = titleCaseShortToken(formatEventMonthShort(value))
  return [weekday, day, month].filter(Boolean).join(" ")
}

/** Formato cartelera: "SAB 24 NOV" */
export function formatDiscoveryDate(value: string | Date): string {
  return formatOrEmpty(value, (date) => {
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
  })
}

/** Formato card: "SÁB 15 AGO • 23:30 HS" */
export function formatDiscoveryDateTime(value: string | Date): string {
  return formatOrEmpty(value, (date) => {
    const dayPart = formatDiscoveryDate(date)
    const time = normalizeIntlOutput(eventTimeFormatter.format(date)).replace(
      /\s/g,
      "",
    )
    return `${dayPart} • ${time} HS`
  })
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`
}

function titleStoryDate(value: string): string {
  return value
    .split(" ")
    .map((word, index) => {
      const bare = word.replace(/[.,]/g, "").toLowerCase()
      if (index > 0 && ["de", "del", "al", "y"].includes(bare)) {
        return word.toLowerCase()
      }
      if (!word) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function storyCalendarDay(value: string): {
  y: number
  m: number
  d: number
  iso: string
} | null {
  const date = toValidDate(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date)
  const y = Number(parts.find((part) => part.type === "year")?.value)
  const m = Number(parts.find((part) => part.type === "month")?.value)
  const d = Number(parts.find((part) => part.type === "day")?.value)
  if (!y || !m || !d) return null
  return { y, m, d, iso: value }
}

function storyMonthName(month: number): string {
  return titleStoryDate(
    new Intl.DateTimeFormat("es-AR", { month: "long" }).format(
      new Date(2026, month - 1, 15),
    ),
  )
}

function uniqueStoryDays(values: string[]) {
  const map = new Map<string, { y: number; m: number; d: number; iso: string }>()
  for (const value of values) {
    const day = storyCalendarDay(value)
    if (!day) continue
    map.set(`${day.y}-${day.m}-${day.d}`, day)
  }
  return [...map.values()].sort(
    (a, b) => a.y - b.y || a.m - b.m || a.d - b.d,
  )
}

function areConsecutiveStoryDays(
  days: Array<{ y: number; m: number; d: number }>,
): boolean {
  for (let index = 1; index < days.length; index += 1) {
    const previous = Date.UTC(
      days[index - 1].y,
      days[index - 1].m - 1,
      days[index - 1].d,
    )
    const current = Date.UTC(days[index].y, days[index].m - 1, days[index].d)
    if (current - previous !== 86_400_000) return false
  }
  return true
}

export function formatStoryEventDates(values: string[]): string {
  const days = uniqueStoryDays(values)
  if (days.length === 0) return ""
  if (days.length === 1) return titleStoryDate(formatEventDay(days[0].iso))

  const first = days[0]
  const last = days[days.length - 1]
  if (areConsecutiveStoryDays(days)) {
    if (first.m === last.m && first.y === last.y) {
      return `Del ${first.d} al ${last.d} de ${storyMonthName(first.m)} de ${first.y}`
    }
    if (first.y === last.y) {
      return `Del ${first.d} de ${storyMonthName(first.m)} al ${last.d} de ${storyMonthName(last.m)} de ${first.y}`
    }
    return `Del ${first.d} de ${storyMonthName(first.m)} de ${first.y} al ${last.d} de ${storyMonthName(last.m)} de ${last.y}`
  }

  const sameMonth = days.every((day) => day.m === first.m && day.y === first.y)
  if (sameMonth) {
    const numbers = days.map((day) => String(day.d))
    return `${numbers.slice(0, -1).join(", ")} y ${numbers.at(-1)} de ${storyMonthName(first.m)} de ${first.y}`
  }

  const labels = days.map((day) => `${day.d} de ${storyMonthName(day.m)}`)
  return `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)} de ${last.y}`
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
