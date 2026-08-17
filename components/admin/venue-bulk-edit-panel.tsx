"use client"

import { Hash, Palette } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import { defaultBulkPrefix } from "@/lib/seating/studio-bulk-edit"
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
  onPrice,
  onColor,
  onCapacity,
  onNumber,
}: {
  elements: VenueMapElement[]
  onPrice: (price: number) => void
  onColor: (color: string) => void
  onCapacity: (capacity: number) => void
  onNumber: (prefix: string, start: number) => void
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
  const [prefix, setPrefix] = useState(() => defaultBulkPrefix(elements))
  const [start, setStart] = useState(1)

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

      <div className="space-y-3 rounded-xl border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <Hash className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">
            Numeración Inteligente
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prefijo">
            <Input
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="Mesa"
            />
          </Field>
          <Field label="Comenzar desde">
            <Input
              type="number"
              min={0}
              value={start}
              onChange={(event) => setStart(Number(event.target.value) || 1)}
            />
          </Field>
        </div>
        <Button
          type="button"
          className="min-h-[44px] w-full"
          onClick={() => onNumber(prefix, start)}
        >
          Aplicar Numeración Correlativa
        </Button>
      </div>
    </div>
  )
}
