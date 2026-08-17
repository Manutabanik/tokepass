"use client"

import type { VenuePriceMode, VenueSellMode } from "@/types/venue-map"

export function VenuePriceModeControl({
  id,
  value,
  onChange,
}: {
  id: string
  value: VenuePriceMode
  onChange: (next: { sellMode: VenueSellMode; priceMode: VenuePriceMode }) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">
        Cómo se cobra este lugar
      </legend>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="radio"
          name={`price-mode-${id}`}
          className="mt-1"
          checked={value === "closed_unit"}
          onChange={() =>
            onChange({ sellMode: "group", priceMode: "closed_unit" })
          }
        />
        <span>
          Precio por mesa/unidad completa
          <span className="mt-0.5 block text-xs text-muted-foreground">
            1 mesa = 1 unidad de stock = 1 precio. Las sillas van incluidas.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="radio"
          name={`price-mode-${id}`}
          className="mt-1"
          checked={value === "per_person"}
          onChange={() =>
            onChange({ sellMode: "per_seat", priceMode: "per_person" })
          }
        />
        <span>
          Precio por persona/lugar
          <span className="mt-0.5 block text-xs text-muted-foreground">
            El precio se multiplica por cada silla o acceso.
          </span>
        </span>
      </label>
    </fieldset>
  )
}
