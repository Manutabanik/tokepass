"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import { summarizeVenueInventory } from "@/lib/seating/venue-inventory-dashboard"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function SaveMapModal({
  open,
  onOpenChange,
  map,
  saving = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  map: InteractiveVenueMap
  saving?: boolean
  onConfirm: () => void
}) {
  const summary = summarizeVenueInventory(map)
  const zoneCount = map.zones?.length ?? 0
  const sectorBlocks = map.sectors.length
  const totalSectorsCount = summary.sectorCount || zoneCount + sectorBlocks
  const totalCapacityCount = summary.capacity
  const pricedRows = summary.sectors.filter((row) => row.price > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-white/10 bg-card p-6 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Confirmar estructura del mapa
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Revisá el resumen de la distribución antes de actualizar el evento.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-2 rounded-xl border border-white/5 bg-black/30 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Sectores / Zonas creadas:</span>
            <span className="font-bold">
              {totalSectorsCount}{" "}
              {totalSectorsCount === 1 ? "sector" : "sectores"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Total de lugares / aforo:</span>
            <span className="font-bold text-emerald-400">
              {totalCapacityCount}{" "}
              {totalCapacityCount === 1 ? "entrada" : "entradas"}
            </span>
          </div>
          {pricedRows.length > 0 ? (
            <div className="space-y-1.5 border-t border-white/5 pt-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Precios por sector
              </p>
              {pricedRows.map((row) => (
                <div key={row.id} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">{row.name}</span>
                  <span className="shrink-0 font-semibold">
                    {formatCurrency(row.price)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Seguir editando
          </Button>
          <Button
            type="button"
            disabled={saving}
            className="bg-emerald-500 font-bold hover:bg-emerald-600"
            onClick={onConfirm}
          >
            Confirmar y Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
