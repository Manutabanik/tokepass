"use client"

import {
  Ban,
  Check,
  Plus,
  Rows3,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  VenueLayoutType,
  VenueSeatingItem,
} from "@/types/venues"

export type VenueRowDraft = {
  key: string
  label: string
  itemCount: string
  labelPrefix: string
  capacityPerUnit: string
  items: VenueSeatingItem[]
}

export type VenueZoneDraft = {
  key: string
  name: string
  type: "general_admission" | "reserved_seating"
  layoutType: VenueLayoutType
  capacity: string
  rows: VenueRowDraft[]
  color: string
}

function createEmptyRow(index: number, layoutType: VenueLayoutType): VenueRowDraft {
  return {
    key: crypto.randomUUID(),
    label: `Fila ${index}`,
    itemCount: "10",
    labelPrefix: layoutType === "numbered_seat" ? "Butaca " : "Mesa ",
    capacityPerUnit: layoutType === "numbered_seat" ? "1" : "4",
    items: [],
  }
}

export function createEmptyZone(structured = false): VenueZoneDraft {
  const layoutType = structured ? "table_combo" : "general"
  return {
    key: crypto.randomUUID(),
    name: "",
    type: "general_admission",
    layoutType,
    capacity: "",
    rows: structured ? [createEmptyRow(1, layoutType)] : [],
    color: "#10B981",
  }
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ubicacion"
  )
}

function zoneCapacity(zone: VenueZoneDraft): number {
  return zone.rows.reduce(
    (total, row) =>
      total +
      row.items.reduce(
        (rowTotal, item) => rowTotal + Math.max(1, item.capacity),
        0,
      ),
    0,
  )
}

export function SmartVenueBuilder({
  structured,
  zones,
  onChange,
}: {
  structured: boolean
  zones: VenueZoneDraft[]
  onChange: (zones: VenueZoneDraft[]) => void
}) {
  function updateZone(key: string, patch: Partial<VenueZoneDraft>) {
    onChange(
      zones.map((zone) => (zone.key === key ? { ...zone, ...patch } : zone)),
    )
  }

  function updateRow(
    zone: VenueZoneDraft,
    rowKey: string,
    patch: Partial<VenueRowDraft>,
  ) {
    const rows = zone.rows.map((row) =>
      row.key === rowKey ? { ...row, ...patch } : row,
    )
    updateZone(zone.key, {
      rows,
      capacity: String(
        rows.reduce(
          (total, row) =>
            total +
            row.items.reduce(
              (subtotal, item) => subtotal + Math.max(1, item.capacity),
              0,
            ),
          0,
        ),
      ),
    })
  }

  function generateRow(zone: VenueZoneDraft, row: VenueRowDraft) {
    const count = Number(row.itemCount)
    const capacity = Math.max(1, Math.min(100, Number(row.capacityPerUnit) || 1))
    if (!Number.isInteger(count) || count < 1 || count > 500) return

    const items = Array.from({ length: count }, (_, index) => {
      const number = index + 1
      return {
        id: `${slug(zone.key)}-${slug(row.key)}-${number}`,
        label: `${row.labelPrefix}${String(number).padStart(2, "0")}`,
        capacity,
        status: "available" as const,
      }
    })
    updateRow(zone, row.key, { items })
  }

  function addManualItem(zone: VenueZoneDraft, row: VenueRowDraft) {
    const nextNumber = row.items.length + 1
    const capacity = Math.max(1, Math.min(100, Number(row.capacityPerUnit) || 1))
    updateRow(zone, row.key, {
      itemCount: String(nextNumber),
      items: [
        ...row.items,
        {
          id: `${slug(zone.key)}-${slug(row.key)}-${crypto.randomUUID()}`,
          label: `${row.labelPrefix}${String(nextNumber).padStart(2, "0")}`,
          capacity,
          status: "available",
        },
      ],
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-white">Zonas o sectores del lugar</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {structured
              ? "Cada zona puede tener filas con distinta cantidad de asientos."
              : "Solo necesitás nombre y cantidad de personas para vender entradas generales."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([...zones, createEmptyZone(structured)])}
          className="rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-emerald-400 hover:bg-zinc-700"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Agregar zona
        </Button>
      </div>

      <div className="space-y-4">
        {zones.map((zone, zoneIndex) => {
          const capacity = structured ? zoneCapacity(zone) : Number(zone.capacity)
          return (
            <article
              key={zone.key}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-12">
                <div className={structured ? "sm:col-span-5" : "sm:col-span-8"}>
                  <Label
                    htmlFor={`zone-${zone.key}-name`}
                    className="text-[10px] uppercase tracking-wider text-zinc-500"
                  >
                    Nombre de la zona (Ej: VIP, Campo, Platea)
                  </Label>
                  <Input
                    id={`zone-${zone.key}-name`}
                    value={zone.name}
                    required
                    onChange={(event) =>
                      updateZone(zone.key, { name: event.target.value })
                    }
                    placeholder={
                      zoneIndex === 0
                        ? "VIP"
                        : "Campo / Platea"
                    }
                    className="mt-1.5 h-10 border-zinc-800 bg-zinc-950"
                  />
                </div>

                {structured ? (
                  <div className="sm:col-span-4">
                    <Label
                      htmlFor={`zone-${zone.key}-type`}
                      className="text-[10px] uppercase tracking-wider text-zinc-500"
                    >
                      Tipo de ubicación
                    </Label>
                    <Select
                      value={zone.layoutType}
                      onValueChange={(value) => {
                        const layoutType =
                          value === "numbered_seat"
                            ? "numbered_seat"
                            : "table_combo"
                        updateZone(zone.key, {
                          layoutType,
                          rows: zone.rows.map((row) => ({
                            ...row,
                            labelPrefix:
                              layoutType === "numbered_seat"
                                ? "Butaca "
                                : row.labelPrefix || "Mesa ",
                            capacityPerUnit:
                              layoutType === "numbered_seat"
                                ? "1"
                                : row.capacityPerUnit,
                          })),
                        })
                      }}
                    >
                      <SelectTrigger
                        id={`zone-${zone.key}-type`}
                        className="mt-1.5 h-10 w-full border-zinc-800 bg-zinc-950"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table_combo">
                          Mesa / Combo Cerrado
                        </SelectItem>
                        <SelectItem value="numbered_seat">
                          Asiento Numerado
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className={structured ? "sm:col-span-2" : "sm:col-span-3"}>
                  <Label
                    htmlFor={`zone-${zone.key}-capacity`}
                    className="text-[10px] uppercase tracking-wider text-zinc-500"
                  >
                    Cantidad de personas
                  </Label>
                  <Input
                    id={`zone-${zone.key}-capacity`}
                    type="number"
                    min={1}
                    required
                    readOnly={structured}
                    value={Number.isFinite(capacity) ? String(capacity || "") : ""}
                    onChange={(event) =>
                      updateZone(zone.key, { capacity: event.target.value })
                    }
                    className="mt-1.5 h-10 border-zinc-800 bg-zinc-950"
                  />
                </div>

                <div className="flex justify-end pt-6 sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      onChange(zones.filter((item) => item.key !== zone.key))
                    }
                    className="text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                    aria-label={`Eliminar zona ${zone.name || zoneIndex + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {structured ? (
                <div className="mt-4 border-t border-zinc-800/70 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Rows3 className="size-4 text-indigo-300" aria-hidden="true" />
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          Filas con distinta cantidad de asientos
                        </h4>
                        <p className="text-[11px] text-zinc-500">
                          Cada fila define su propia cantidad de asientos.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        Color
                        <input
                          type="color"
                          value={zone.color}
                          onChange={(event) =>
                            updateZone(zone.key, { color: event.target.value })
                          }
                          className="size-8 rounded-lg border border-zinc-700 bg-zinc-900 p-1"
                          aria-label={`Color de ${zone.name || "zona"}`}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          updateZone(zone.key, {
                            rows: [
                              ...zone.rows,
                              createEmptyRow(
                                zone.rows.length + 1,
                                zone.layoutType,
                              ),
                            ],
                          })
                        }
                        className="rounded-lg bg-indigo-500/10 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        Agregar fila
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {zone.rows.map((row, rowIndex) => (
                      <div
                        key={row.key}
                        className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4"
                      >
                        <div className="grid gap-3 sm:grid-cols-12">
                          <div className="sm:col-span-4">
                            <Label
                              htmlFor={`row-${row.key}-label`}
                              className="text-[10px] uppercase tracking-wider text-zinc-500"
                            >
                              Nombre de la fila
                            </Label>
                            <Input
                              id={`row-${row.key}-label`}
                              value={row.label}
                              required
                              onChange={(event) =>
                                updateRow(zone, row.key, {
                                  label: event.target.value,
                                })
                              }
                              placeholder="Fila 1 - Frente al escenario"
                              className="mt-1.5 h-10 border-zinc-800 bg-zinc-950"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label
                              htmlFor={`row-${row.key}-count`}
                              className="text-[10px] uppercase tracking-wider text-zinc-500"
                            >
                              Ubicaciones
                            </Label>
                            <Input
                              id={`row-${row.key}-count`}
                              type="number"
                              min={1}
                              max={500}
                              value={row.itemCount}
                              onChange={(event) =>
                                updateRow(zone, row.key, {
                                  itemCount: event.target.value,
                                })
                              }
                              className="mt-1.5 h-10 border-zinc-800 bg-zinc-950"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label
                              htmlFor={`row-${row.key}-prefix`}
                              className="text-[10px] uppercase tracking-wider text-zinc-500"
                            >
                              Prefijo
                            </Label>
                            <Input
                              id={`row-${row.key}-prefix`}
                              value={row.labelPrefix}
                              onChange={(event) =>
                                updateRow(zone, row.key, {
                                  labelPrefix: event.target.value,
                                })
                              }
                              className="mt-1.5 h-10 border-zinc-800 bg-zinc-950"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label
                              htmlFor={`row-${row.key}-capacity`}
                              className="text-[10px] uppercase tracking-wider text-zinc-500"
                            >
                              Personas / unidad
                            </Label>
                            <Input
                              id={`row-${row.key}-capacity`}
                              type="number"
                              min={1}
                              max={100}
                              readOnly={zone.layoutType === "numbered_seat"}
                              value={row.capacityPerUnit}
                              onChange={(event) =>
                                updateRow(zone, row.key, {
                                  capacityPerUnit: event.target.value,
                                })
                              }
                              className="mt-1.5 h-10 border-zinc-800 bg-zinc-950"
                            />
                          </div>
                          <div className="flex items-end gap-1 sm:col-span-2">
                            <Button
                              type="button"
                              onClick={() => generateRow(zone, row)}
                              className="h-10 flex-1 rounded-lg bg-emerald-500/10 px-2 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
                            >
                              <WandSparkles className="size-3.5" aria-hidden="true" />
                              Generar fila
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={zone.rows.length === 1}
                              onClick={() =>
                                updateZone(zone.key, {
                                  rows: zone.rows.filter(
                                    (item) => item.key !== row.key,
                                  ),
                                })
                              }
                              className="text-zinc-600 hover:text-red-400"
                              aria-label={`Eliminar ${row.label || rowIndex + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        {row.items.length > 0 ? (
                          <div className="mt-3 border-t border-zinc-800/70 pt-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-[11px] text-zinc-500">
                                {row.items.length} ubicaciones ·{" "}
                                {
                                  row.items.filter(
                                    (item) => item.status === "blocked",
                                  ).length
                                }{" "}
                                desactivadas
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => addManualItem(zone, row)}
                                className="h-7 rounded-lg bg-zinc-800 px-2 text-[10px] text-zinc-300 hover:bg-zinc-700"
                              >
                                <Plus className="size-3" aria-hidden="true" />
                                Añadir ubicación
                              </Button>
                            </div>
                            <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-7">
                              {row.items.map((item) => {
                                const blocked = item.status === "blocked"
                                return (
                                  <div key={item.id} className="relative flex min-w-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRow(zone, row.key, {
                                          items: row.items.map((current) =>
                                            current.id === item.id
                                              ? {
                                                  ...current,
                                                  status: blocked
                                                    ? "available"
                                                    : "blocked",
                                                }
                                              : current,
                                          ),
                                        })
                                      }
                                      className={cn(
                                        "h-10 min-w-0 flex-1 truncate rounded-lg border px-2 pr-6 font-mono text-[10px] font-bold",
                                        blocked
                                          ? "border-zinc-800 bg-zinc-900 text-zinc-600"
                                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                                      )}
                                      title={
                                        blocked
                                          ? `Habilitar ${item.label}`
                                          : `Desactivar ${item.label}`
                                      }
                                    >
                                      {blocked ? (
                                        <Ban className="mr-1 inline size-3" />
                                      ) : (
                                        <Check className="mr-1 inline size-3" />
                                      )}
                                      {item.label.replace(/\D+/g, "") ||
                                        item.label}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRow(zone, row.key, {
                                          items: row.items.filter(
                                            (current) => current.id !== item.id,
                                          ),
                                        })
                                      }
                                      className="absolute right-0.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                                      aria-label={`Eliminar ${item.label}`}
                                    >
                                      <X className="size-3" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
                            Configurá la cantidad y generá esta fila.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
