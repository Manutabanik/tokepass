"use client"

import { DRAFT_FIELD_CLASS } from "./event-editor-v2-ui"
import type { DraftScheduleSlotOption } from "@/lib/events/draft-schedule-slots-v2"
import { cn } from "@/lib/utils"

export const ANY_DRAFT_SLOT_VALUE = ""

export function EventEditorV2SlotSelect({
  value,
  options,
  ariaLabel,
  compact = false,
  onChange,
}: {
  value: string
  options: DraftScheduleSlotOption[]
  ariaLabel: string
  compact?: boolean
  onChange: (slotId: string) => void
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        DRAFT_FIELD_CLASS,
        compact && "h-9 rounded-lg px-2 py-1 text-xs",
      )}
    >
      <option value={ANY_DRAFT_SLOT_VALUE}>Válidas para cualquier turno</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
