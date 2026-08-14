"use client"

import { Plus, Trash2 } from "lucide-react"
import { useMemo } from "react"

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
import type { ZoneTierPriceDraft } from "@/lib/stores/event-form-store"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export type PricingSectorOption = {
  id: string
  name: string
}

export type PricingTierOption = {
  id: string
  name: string
  price: number
  layoutType: "general" | "table_combo" | "numbered_seat"
}

type Props = {
  sectors: PricingSectorOption[]
  tiers: PricingTierOption[]
  rows: ZoneTierPriceDraft[]
  onChange: (rows: ZoneTierPriceDraft[]) => void
  className?: string
}

function emptyRow(sector: PricingSectorOption, tier?: PricingTierOption): ZoneTierPriceDraft {
  return {
    sectorKey: sector.id,
    sectorName: sector.name,
    ticketTierId: tier?.id ?? "",
    ticketTierName: tier?.name ?? "",
    price: tier?.price ?? 0,
    tableNumberStart: null,
    tableNumberEnd: null,
  }
}

export function ZoneTierPricingMatrix({
  sectors,
  tiers,
  rows,
  onChange,
  className,
}: Props) {
  const tiersById = useMemo(
    () => new Map(tiers.map((tier) => [tier.id, tier])),
    [tiers],
  )

  const rowsBySector = useMemo(() => {
    const map = new Map<string, ZoneTierPriceDraft[]>()
    for (const sector of sectors) map.set(sector.id, [])
    for (const row of rows) {
      const list = map.get(row.sectorKey) ?? []
      list.push(row)
      map.set(row.sectorKey, list)
    }
    return map
  }, [rows, sectors])

  function updateRow(
    sectorKey: string,
    index: number,
    patch: Partial<ZoneTierPriceDraft>,
  ) {
    const next = [...rows]
    let seen = 0
    for (let i = 0; i < next.length; i += 1) {
      if (next[i]!.sectorKey !== sectorKey) continue
      if (seen === index) {
        next[i] = { ...next[i]!, ...patch }
        break
      }
      seen += 1
    }
    onChange(next)
  }

  function addRow(sector: PricingSectorOption) {
    const defaultTier =
      tiers.find((t) => t.layoutType === "table_combo") ?? tiers[0]
    onChange([...rows, emptyRow(sector, defaultTier)])
  }

  function removeRow(sectorKey: string, index: number) {
    const next: ZoneTierPriceDraft[] = []
    let seen = 0
    for (const row of rows) {
      if (row.sectorKey !== sectorKey) {
        next.push(row)
        continue
      }
      if (seen !== index) next.push(row)
      seen += 1
    }
    onChange(next)
  }

  if (sectors.length === 0) {
    return (
      <p
        className={cn(
          "rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        Definí zonas del lugar para armar la matriz de precios.
      </p>
    )
  }

  if (tiers.length === 0) {
    return (
      <p
        className={cn(
          "rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        Creá al menos un tipo de entrada / combo para asignar precios por sector.
      </p>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Matriz de precios · Sector × Tipo de entrada
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Asigná el precio All-In de cada combo/mesa por zona y el rango de
          numeración (ej. mesas 1–20).
        </p>
      </div>

      {sectors.map((sector) => {
        const sectorRows = rowsBySector.get(sector.id) ?? []
        return (
          <section
            key={sector.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {sector.name}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addRow(sector)}
              >
                <Plus className="size-3.5" />
                Agregar tipo / combo
              </Button>
            </div>

            {sectorRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Sin tarifas en este sector. Agregá un tipo de entrada.
              </p>
            ) : (
              <ul className="space-y-3">
                {sectorRows.map((row, index) => {
                  const tierItems = tiers.map((tier) => ({
                    value: tier.id,
                    label: `${tier.name} · ${formatCurrency(tier.price)}`,
                  }))
                  return (
                    <li
                      key={`${sector.id}-${index}-${row.ticketTierId}`}
                      className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[minmax(0,1.4fr)_7rem_5.5rem_5.5rem_auto]"
                    >
                      <div className="min-w-0 space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Tipo de entrada / combo
                        </Label>
                        <Select
                          value={row.ticketTierId || undefined}
                          onValueChange={(value) => {
                            if (!value) return
                            const tier = tiersById.get(value)
                            updateRow(sector.id, index, {
                              ticketTierId: value,
                              ticketTierName: tier?.name ?? "",
                              price: tier?.price ?? row.price,
                            })
                          }}
                          items={tierItems}
                        >
                          <SelectTrigger className="h-10 w-full max-w-full overflow-hidden">
                            <SelectValue placeholder="Seleccioná un tipo">
                              {row.ticketTierId
                                ? `${row.ticketTierName || tiersById.get(row.ticketTierId)?.name || "Tipo"} (${formatCurrency(row.price)})`
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {tiers.map((tier) => (
                              <SelectItem key={tier.id} value={tier.id}>
                                <span className="block max-w-[200px] truncate sm:max-w-[280px]">
                                  {tier.name}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {formatCurrency(tier.price)}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Precio
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          value={Number.isFinite(row.price) ? row.price : 0}
                          onChange={(e) =>
                            updateRow(sector.id, index, {
                              price: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="h-10"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Mesa desde
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="1"
                          value={row.tableNumberStart ?? ""}
                          onChange={(e) =>
                            updateRow(sector.id, index, {
                              tableNumberStart: e.target.value
                                ? Math.max(1, Number(e.target.value) || 1)
                                : null,
                            })
                          }
                          className="h-10"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Mesa hasta
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="20"
                          value={row.tableNumberEnd ?? ""}
                          onChange={(e) =>
                            updateRow(sector.id, index, {
                              tableNumberEnd: e.target.value
                                ? Math.max(1, Number(e.target.value) || 1)
                                : null,
                            })
                          }
                          className="h-10"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => removeRow(sector.id, index)}
                          aria-label="Quitar tarifa"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
