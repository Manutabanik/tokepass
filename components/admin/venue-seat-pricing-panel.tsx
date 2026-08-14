"use client"

import { Eye, MapPinned } from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"

import type { OrganizerVenue } from "@/app/actions/venues"
import { UniversalSeatSelectionFlow } from "@/components/b2c/universal-seat-selection"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/format"
import {
  listPricableSectors,
  mapVenueToUniversalSeatData,
  type VenuePricingMap,
  type VenueSectorPriceEntry,
} from "@/lib/seating/venue-adapter"
import { cn } from "@/lib/utils"

function asEntry(value: number | VenueSectorPriceEntry | undefined): VenueSectorPriceEntry {
  if (value == null) return { price: 0 }
  if (typeof value === "number") return { price: value }
  return {
    price: value.price ?? 0,
    groupPrices: value.groupPrices,
  }
}

type VenueSeatPricingPanelProps = {
  venue: OrganizerVenue
  pricingMap: VenuePricingMap
  onPricingChange: (next: VenuePricingMap) => void
  eventTitle?: string
  className?: string
}

export function VenueSeatPricingPanel({
  venue,
  pricingMap,
  onPricingChange,
  eventTitle,
  className,
}: VenueSeatPricingPanelProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [expandedSectorId, setExpandedSectorId] = useState<string | null>(null)

  const sectors = useMemo(() => listPricableSectors(venue), [venue])
  const previewPayload = useMemo(
    () => mapVenueToUniversalSeatData(venue, pricingMap),
    [venue, pricingMap],
  )

  function setSectorPrice(sectorId: string, price: number) {
    const current = asEntry(pricingMap[sectorId])
    onPricingChange({
      ...pricingMap,
      [sectorId]: {
        ...current,
        price: Number.isFinite(price) ? Math.max(0, price) : 0,
      },
    })
  }

  function setGroupPrice(sectorId: string, groupId: string, price: number) {
    const current = asEntry(pricingMap[sectorId])
    onPricingChange({
      ...pricingMap,
      [sectorId]: {
        ...current,
        groupPrices: {
          ...(current.groupPrices ?? {}),
          [groupId]: Number.isFinite(price) ? Math.max(0, price) : 0,
        },
      },
    })
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
            Precios por zona del lugar
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Asigná el precio que verá el comprador en cada zona. En
            numerados podés definir precio por fila.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
        >
          <Eye className="size-4" />
          Ver vista previa de selección de entradas
        </Button>
      </div>

      {venue.seatingBackgroundUrl ? (
        <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-border bg-muted">
          <Image
            src={venue.seatingBackgroundUrl}
            alt={`Mapa de ${venue.name}`}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 640px"
            unoptimized
          />
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
            <MapPinned className="size-3.5 text-emerald-700 dark:text-emerald-400" />
            Imagen o mapa del lugar
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted px-3 py-3 text-xs text-muted-foreground">
          Este lugar no tiene imagen o mapa cargado.
        </p>
      )}

      <ul className="space-y-3">
        {sectors.map((sector) => {
          const entry = asEntry(pricingMap[sector.id])
          const universalSector = previewPayload.sectors.find(
            (item) => item.id === sector.id,
          )
          const groups =
            universalSector?.type === "numbered" ? universalSector.groups : []
          const expanded = expandedSectorId === sector.id

          return (
            <li
              key={sector.id}
              className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: sector.color }}
                      aria-hidden
                    />
                    <p className="truncate text-sm font-medium text-foreground">
                      {sector.name}
                    </p>
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {sector.type === "general" ? "General" : "Numerado"}
                    </span>
                  </div>
                  {sector.type === "numbered" && sector.groupCount > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSectorId(expanded ? null : sector.id)
                      }
                      className="mt-1 text-xs font-medium text-emerald-800 hover:text-emerald-950 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {expanded
                        ? "Ocultar precios por fila"
                        : `Precio por fila (${sector.groupCount})`}
                    </button>
                  ) : null}
                </div>
                <div className="w-full sm:w-40">
                  <Label
                    htmlFor={`sector-price-${sector.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Precio de la zona
                  </Label>
                  <Input
                    id={`sector-price-${sector.id}`}
                    type="number"
                    min={0}
                    step={100}
                    value={Number.isFinite(entry.price) ? entry.price : 0}
                    onChange={(event) =>
                      setSectorPrice(sector.id, Number(event.target.value))
                    }
                    className="mt-1 h-10"
                  />
                </div>
              </div>

              {expanded && groups.length > 0 ? (
                <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                  {groups.map((group) => {
                    const groupPrice =
                      entry.groupPrices?.[group.id] ?? entry.price
                    return (
                      <div key={group.id} className="flex items-center gap-2">
                        <Label
                          htmlFor={`group-price-${group.id}`}
                          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                        >
                          {group.name}
                        </Label>
                        <Input
                          id={`group-price-${group.id}`}
                          type="number"
                          min={0}
                          step={100}
                          value={Number.isFinite(groupPrice) ? groupPrice : 0}
                          onChange={(event) =>
                            setGroupPrice(
                              sector.id,
                              group.id,
                              Number(event.target.value),
                            )
                          }
                          className="h-9 w-28"
                        />
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Vista previa con precios actuales · total de sectores:{" "}
        {sectors.length}
        {sectors.some((s) => asEntry(pricingMap[s.id]).price > 0)
          ? ` · desde ${formatCurrency(
              Math.min(
                ...sectors.map((s) => asEntry(pricingMap[s.id]).price || 0),
              ),
            )}`
          : null}
      </p>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="text-base text-foreground">
              Vista previa · selección de entradas
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Experiencia del comprador con {venue.name} y los precios
              cargados ahora.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(92dvh-5.5rem)] overflow-y-auto px-4 py-4 sm:px-5">
            <UniversalSeatSelectionFlow
              key={`${venue.id}-${JSON.stringify(pricingMap)}`}
              sectors={previewPayload.sectors}
              mapImageUrl={previewPayload.mapImageUrl}
              eventTitle={eventTitle?.trim() || venue.name}
              onContinue={() => setPreviewOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type SavedVenuePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  venues: OrganizerVenue[]
  selectedVenueId: string | null
  onSelect: (venue: OrganizerVenue) => void
}

export function SavedVenuePickerDialog({
  open,
  onOpenChange,
  venues,
  selectedVenueId,
  onSelect,
}: SavedVenuePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] border-border bg-card text-card-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lugares guardados</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Elegí un lugar para importar mapa, zonas y capacidad de gente.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
          {venues.map((venue) => {
            const selected = venue.id === selectedVenueId
            const sectorCount =
              venue.seatingLayout.length > 0
                ? venue.seatingLayout.length
                : venue.zoneBlueprint.length
            return (
              <li key={venue.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(venue)
                    onOpenChange(false)
                  }}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-border bg-muted/60 hover:bg-muted",
                  )}
                >
                  <span className="block font-medium text-foreground">
                    {venue.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {[venue.city, venue.location].filter(Boolean).join(" · ") ||
                      "Sin ubicación"}
                    {" · "}
                    {venue.capacity} cupos
                    {" · "}
                    {sectorCount} zona{sectorCount === 1 ? "" : "s"}
                    {venue.seatingBackgroundUrl ? " · con mapa" : ""}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
