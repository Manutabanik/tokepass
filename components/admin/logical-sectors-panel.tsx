"use client"

import { Plus, Trash2, Users } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createBlankLogicalSector,
  listGeneralLogicalSectors,
  logicalSectorId,
} from "@/lib/inventory/logical-sectors"
import { formatNumber } from "@/lib/format"
import type { EventFormValues } from "@/lib/validations/event-form"

export function LogicalSectorsPanel({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
  const zones = form.watch("venue.zones") ?? []
  const tickets = form.watch("tickets") ?? []
  const generals = listGeneralLogicalSectors(zones)

  function writeZones(
    next: NonNullable<EventFormValues["venue"]["zones"]>,
  ) {
    form.setValue("venue.zones", next, { shouldDirty: true })
    form.setValue("venue.zoneType", "general_admission", { shouldDirty: true })
  }

  function addSector() {
    writeZones([...(zones ?? []), createBlankLogicalSector(zones)])
  }

  function updateSector(
    sectorId: string,
    patch: Partial<NonNullable<EventFormValues["venue"]["zones"]>[number]>,
  ) {
    writeZones(
      (zones ?? []).map((zone) => {
        const id = logicalSectorId(zone.name, zone.id)
        if (id !== sectorId) return zone
        const name = patch.name ?? zone.name
        return {
          ...zone,
          ...patch,
          id: zone.id || logicalSectorId(name, zone.id),
          type: "general_admission" as const,
        }
      }),
    )
  }

  function removeSector(sectorId: string) {
    writeZones(
      (zones ?? []).filter(
        (zone) => logicalSectorId(zone.name, zone.id) !== sectorId,
      ),
    )
    form.setValue(
      "tickets",
      tickets.map((tier) =>
        tier.seatingSectorId === sectorId
          ? { ...tier, seatingSectorId: null }
          : tier,
      ),
      { shouldDirty: true },
    )
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-muted/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Sectores generales (sin mapa)
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Pista, VIP de pie u otras zonas con cupo numerico. No hace falta
              dibujarlas en el canvas.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSector}
          className="shrink-0"
        >
          <Plus className="size-4" />
          Agregar sector
        </Button>
      </div>

      {generals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin sectores generales. El aforo total sale solo del mapa, si lo hay.
        </p>
      ) : (
        <div className="space-y-3">
          {generals.map((sector) => (
            <div
              key={sector.id}
              className="relative grid gap-3 rounded-xl border border-border bg-card p-3 pr-12 sm:grid-cols-12"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 size-9"
                onClick={() => removeSector(sector.id)}
                aria-label={`Quitar ${sector.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
              <div className="sm:col-span-7">
                <Label className="text-xs">Nombre del sector</Label>
                <Input
                  className="mt-1.5 h-11"
                  value={sector.name}
                  onChange={(event) =>
                    updateSector(sector.id, { name: event.target.value })
                  }
                  placeholder="Pista"
                />
              </div>
              <div className="sm:col-span-5">
                <Label className="text-xs">Capacidad maxima</Label>
                <Input
                  className="mt-1.5 h-11"
                  type="text"
                  inputMode="numeric"
                  value={sector.capacity || ""}
                  onChange={(event) => {
                    const raw = event.target.value.trim()
                    if (raw === "") {
                      updateSector(sector.id, { capacity: 1 })
                      return
                    }
                    if (!/^\d+$/.test(raw)) return
                    updateSector(sector.id, {
                      capacity: Math.max(1, Number.parseInt(raw, 10)),
                    })
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatNumber(sector.capacity)} personas
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
