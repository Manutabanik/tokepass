"use client"

import { Copy, Edit3, RotateCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PriceInput } from "@/components/ui/price-input"
import {
  describeVenueElementType,
  formatVenuePriceArs,
} from "@/lib/seating/venue-element-geometry"
import { cn } from "@/lib/utils"
import {
  isInfrastructureElement,
  type VenueMapElement,
  type VenueMapSector,
} from "@/types/venue-map"

export function VenueQuickInspector({
  element,
  sector,
  title,
  subtitle,
  price,
  canPrice,
  canRotate,
  canDuplicate,
  onPriceChange,
  onEdit,
  onDuplicate,
  onRotate,
  onDelete,
  className,
}: {
  element?: VenueMapElement | null
  sector?: VenueMapSector | null
  title?: string
  subtitle?: string
  price?: number
  canPrice?: boolean
  canRotate?: boolean
  canDuplicate?: boolean
  onPriceChange?: (price: number) => void
  onEdit?: () => void
  onDuplicate?: () => void
  onRotate?: () => void
  onDelete?: () => void
  className?: string
}) {
  const typeLabel = element
    ? describeVenueElementType(element)
    : sector
      ? "Bloque de asientos"
      : title ?? "Componente"
  const identifier = element?.label ?? sector?.name ?? subtitle ?? ""
  const sectorLabel = element
    ? isInfrastructureElement(element)
      ? "Referencia visual (sin cobro)"
      : element.sectorName
        ? `Sector ${element.sectorName}`
        : "Sin sector"
    : sector
      ? `Sector ${sector.name}`
      : subtitle
  const assignedPrice = element
    ? isInfrastructureElement(element)
      ? null
      : element.price
    : sector
      ? sector.price
      : price
  const showPrice = canPrice !== false && assignedPrice != null

  return (
    <div
      className={cn(
        "w-72 rounded-xl border border-emerald-500/30 bg-card p-3 text-card-foreground shadow-xl ring-1 ring-emerald-400/20",
        className,
      )}
    >
      <p className="text-[11px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
        {typeLabel}
      </p>
      <p className="mt-1 truncate text-sm font-semibold">{identifier}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{sectorLabel}</p>
      {showPrice ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Precio asignado: {formatVenuePriceArs(assignedPrice ?? 0)}
          </p>
          <div className="flex items-center gap-2">
            <PriceInput
              value={assignedPrice}
              onValueChange={(value) => {
                if (value == null) return
                onPriceChange?.(value)
              }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Sin precio de venta.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Edit3 className="size-4" />
          Editar
        </Button>
        {canDuplicate !== false ? (
          <Button type="button" variant="outline" size="icon-sm" onClick={onDuplicate} aria-label="Duplicar">
            <Copy className="size-4" />
          </Button>
        ) : null}
        {canRotate ? (
          <Button type="button" variant="outline" size="icon-sm" onClick={onRotate} aria-label="Girar 90 grados">
            <RotateCw className="size-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Eliminar"
        >
          <Trash2 className="size-4 text-red-500" />
        </Button>
      </div>
    </div>
  )
}
