"use client"

import { cn } from "@/lib/utils"

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
)
const MINUTES = ["00", "15", "30", "45"]

function splitDateTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(value ?? "")
  return {
    date: match?.[1] ?? "",
    hour: match?.[2] ?? "",
    minute: match?.[3] ?? "",
  }
}

function joinDateTime(date: string, hour: string, minute: string) {
  if (!date) return ""
  return `${date}T${hour || "00"}:${minute || "00"}`
}

const selectClass =
  "h-12 min-w-0 rounded-xl border border-border/60 bg-muted/20 px-4 text-base text-foreground transition-all focus:bg-background sm:h-13"

export function EventStudioDateTimeField({
  id,
  fieldName,
  value,
  onChange,
  dateLabel = "Fecha",
  timeLabel = "Hora",
}: {
  id: string
  fieldName?: string
  value: string
  onChange: (next: string) => void
  dateLabel?: string
  timeLabel?: string
}) {
  const parts = splitDateTime(value)
  const minuteOptions = MINUTES.includes(parts.minute)
    ? MINUTES
    : parts.minute
      ? [...MINUTES, parts.minute].sort()
      : MINUTES

  function update(next: { date?: string; hour?: string; minute?: string }) {
    onChange(
      joinDateTime(
        next.date ?? parts.date,
        next.hour ?? parts.hour,
        next.minute ?? parts.minute,
      ),
    )
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <label className="block min-w-0">
          <span className="sr-only">{dateLabel}</span>
          <input
            id={id}
            data-field={fieldName}
            type="date"
            value={parts.date}
            onChange={(event) => update({ date: event.target.value })}
            className={cn(selectClass, "w-full px-3")}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="sr-only">{timeLabel} hora</span>
            <select
              value={parts.hour}
              onChange={(event) => update({ hour: event.target.value })}
              className={cn(selectClass, "w-full")}
              aria-label={`${timeLabel} hora`}
            >
              <option value="">HH</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">{timeLabel} minutos</span>
            <select
              value={parts.minute}
              onChange={(event) => update({ minute: event.target.value })}
              className={cn(selectClass, "w-full")}
              aria-label={`${timeLabel} minutos`}
            >
              <option value="">MM</option>
              {minuteOptions.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
