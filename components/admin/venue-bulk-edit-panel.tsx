"use client"

import { Palette } from "lucide-react"
import { useMemo } from "react"

import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import { venueUnitPriceLabel, type VenueMapElement } from "@/types/venue-map"

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function VenueBulkEditPanel({
  elements,
  allElements,
  selectedIds,
  onPrice,
  onColor,
  onCapacity,
  onApplyElements,
  showNumbering = true,
}: {
  elements: VenueMapElement[]
  allElements: VenueMapElement[]
  selectedIds: string[]
  onPrice: (price: number) => void
  onColor: (color: string) => void
  onCapacity: (capacity: number) => void
  onApplyElements: (next: VenueMapElement[]) => void
  showNumbering?: boolean
}) {
  const sharedColor = elements.every((item) => item.color === elements[0]?.color)
    ? (elements[0]?.color ?? "#888888")
    : "#888888"
  const sharedCapacity = useMemo(() => {
    const values = elements.map((item) =>
      item.type === "standing_zone"
        ? item.capacity
        : item.type === "long_table"
          ? item.sideA + item.sideB
          : item.chairCount,
    )
    return values.every((value) => value === values[0]) ? values[0] : undefined
  }, [elements])

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-foreground">
        {elements.length} Elementos seleccionados
      </p>
      <p className="text-xs text-muted-foreground">
        Los cambios se aplican a todo el grupo en una sola operación.
      </p>

      <Field
        label={venueUnitPriceLabel({
          type: elements[0]?.type,
          sellMode: elements.every((item) => item.sellMode === elements[0]?.sellMode)
            ? elements[0]?.sellMode
            : undefined,
          priceMode: elements.every((item) => item.priceMode === elements[0]?.priceMode)
            ? elements[0]?.priceMode
            : undefined,
        })}
      >
        <PriceInput
          value={
            elements.every((item) => item.price === elements[0]?.price)
              ? elements[0]?.price
              : undefined
          }
          onValueChange={(value) => {
            if (value == null) return
            onPrice(value)
          }}
        />
      </Field>

      <Field label="Color Global">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" />
          <input
            type="color"
            value={sharedColor}
            onChange={(event) => onColor(event.target.value)}
            className="h-11 w-full cursor-pointer rounded border border-border bg-transparent"
          />
        </div>
      </Field>

      <Field label="Capacidad Global">
        <Input
          type="number"
          min={1}
          max={80}
          value={sharedCapacity ?? ""}
          placeholder="Ej. 10"
          onChange={(event) => {
            const next = Number(event.target.value)
            if (!Number.isFinite(next) || next < 1) return
            onCapacity(next)
          }}
        />
      </Field>

      {showNumbering ? (
        <AutoNumberingPanel
          elements={allElements}
          selectedIds={selectedIds}
          onApply={onApplyElements}
        />
      ) : null}
    </div>
  )
}
