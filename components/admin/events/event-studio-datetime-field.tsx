"use client"

import { STUDIO_CONTROL_CLASS } from "@/lib/admin/studio-form-styles"
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

const selectClass = cn(STUDIO_CONTROL_CLASS, "min-w-0")

export function EventStudioDateTimeField({
  id,
  fieldName,
  value,
  onChange,
  invalid = false,
  dateLabel = "Fecha",
  timeLabel = "Hora",
  compact = false,
}: {
  id: string
  fieldName?: string
  value: string
  onChange: (next: string) => void
  invalid?: boolean
  dateLabel?: string
  timeLabel?: string
  compact?: boolean
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
    <div className={compact ? "min-w-0" : "space-y-2"}>
      <div className={compact ? "flex min-w-0 items-center gap-1.5" : "space-y-2"}>
        <label className={cn("block min-w-0", compact && "flex-1")}>
          <span className="sr-only">{dateLabel}</span>
          <input
            id={id}
            data-field={fieldName}
            type="date"
            value={parts.date}
            onChange={(event) => update({ date: event.target.value })}
            aria-invalid={invalid || undefined}
            className={cn(selectClass, "w-full px-3", compact && "h-9")}
          />
        </label>
        <div className={cn("grid grid-cols-2 gap-2", compact && "w-[7.5rem] shrink-0")}>
          <label className="min-w-0">
            <span className="sr-only">{timeLabel} hora</span>
            <select
              value={parts.hour}
              onChange={(event) => update({ hour: event.target.value })}
              className={cn(selectClass, "w-full", compact && "h-9 px-1.5")}
              aria-invalid={invalid || undefined}
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
              className={cn(selectClass, "w-full", compact && "h-9 px-1.5")}
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
