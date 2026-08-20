"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function parsePriceDraft(raw: string): number | undefined {
  const trimmed = raw.trim().replace(",", ".")
  if (trimmed === "" || trimmed === "." || trimmed === "-") return undefined
  if (!/^-?\d*\.?\d*$/.test(trimmed)) return undefined
  const numericValue = Number.parseFloat(trimmed)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

export function PriceInput({
  value,
  onValueChange,
  className,
  id,
  name,
  placeholder,
  disabled,
  min = 0,
  onBlur,
  "aria-invalid": ariaInvalid,
}: {
  value: number | null | undefined
  onValueChange: (value: number | undefined) => void
  className?: string
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  min?: number
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  "aria-invalid"?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState("")

  return (
    <Input
      id={id}
      name={name}
      aria-invalid={ariaInvalid}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder ?? "0"}
      value={
        focused
          ? draft
          : value == null || Number.isNaN(Number(value))
            ? ""
            : String(value)
      }
      onFocus={() => {
        setFocused(true)
        setDraft(
          value == null || Number.isNaN(Number(value)) ? "" : String(value),
        )
      }}
      onChange={(event) => {
        const rawValue = event.target.value
        if (rawValue === "") {
          setDraft("")
          onValueChange(undefined)
          return
        }
        if (!/^\d*[.,]?\d{0,2}$/.test(rawValue)) return
        const normalized = rawValue.replace(",", ".")
        setDraft(normalized)
        const numericValue = parsePriceDraft(normalized)
        if (numericValue != null) onValueChange(numericValue)
      }}
      onBlur={(event) => {
        setFocused(false)
        const numericValue = parsePriceDraft(draft)
        const next =
          numericValue == null || Number.isNaN(numericValue)
            ? min
            : Math.max(min, numericValue)
        onValueChange(next)
        setDraft(String(next))
        onBlur?.(event)
      }}
      className={cn(className)}
    />
  )
}
