"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

export const SECTOR_SWATCHES = [
  "#f97316",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#06b6d4",
  "#a3e635",
  "#e879f9",
]

export function toColorInputValue(color: string): string {
  const raw = color.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1]
    const g = raw[2]
    const b = raw[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`
  return "#f97316"
}

export function VenueSectorColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  const pickerId = useId()
  const selectedSectorColor = toColorInputValue(value)

  function handleColorChange(next: string) {
    onChange(toColorInputValue(next))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {SECTOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            onClick={() => handleColorChange(color)}
            className={cn(
              "size-7 rounded-full border-2",
              selectedSectorColor.toLowerCase() === color
                ? "border-foreground"
                : "border-transparent",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-2">
        <label
          htmlFor={pickerId}
          className="flex-1 text-xs font-medium text-muted-foreground"
        >
          Color personalizado:
        </label>
        <div className="relative size-8 cursor-pointer overflow-hidden rounded-md border border-white/10">
          <input
            id={pickerId}
            type="color"
            value={selectedSectorColor}
            onChange={(event) => handleColorChange(event.target.value)}
            className="absolute -top-2 -left-2 h-16 w-16 cursor-pointer"
            aria-label="Elegir color personalizado"
          />
        </div>
      </div>
    </div>
  )
}
