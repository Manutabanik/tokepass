"use client"

import { useEffect, useRef } from "react"
import { Hash, Rows3, Table2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import { VenuePriceModeControl } from "@/components/admin/venue-price-mode-control"
import { VenueSectorColorPicker } from "@/components/admin/venue-sector-color-field"
import { VenueRowsConfigEditor } from "@/components/admin/venue-rows-config-editor"
import { parametricZoneCapacity } from "@/lib/seating/adaptive-seating"
import { formatCurrency } from "@/lib/format"
import { seatingFieldsForLayoutType } from "@/lib/seating/seating-type"
import {
  resizeRowsConfig,
  resolveZoneRowsConfig,
  rowsConfigGridFields,
} from "@/lib/seating/venue-rows-config"
import {
  venuePriceModeFromSellMode,
  type VenueMapZone,
} from "@/types/venue-map"

export function VenueParametricRulesPanel({
  zone,
  onChange,
  autoFocusName = false,
}: {
  zone: VenueMapZone
  onChange: (patch: Partial<VenueMapZone>) => void
  autoFocusName?: boolean
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const estimated = parametricZoneCapacity(zone)
  const isTableInventory = zone.layoutType === "table_combo"
  const isNumberedSeats = zone.layoutType === "numbered_seat"
  const numberedRows = isNumberedSeats ? resolveZoneRowsConfig(zone) : []
  const units =
    zone.layoutType === "general"
      ? estimated
      : isNumberedSeats
        ? numberedRows.reduce((sum, row) => sum + row.seatCount, 0)
        : Math.max(1, zone.rows) * Math.max(1, zone.itemsPerRow)

  function emitNumberedRows(nextRows: typeof numberedRows) {
    onChange({
      rowsConfig: nextRows,
      ...rowsConfigGridFields(nextRows),
    })
  }

  useEffect(() => {
    if (!autoFocusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [autoFocusName, zone.id])

  return (
    <div className="space-y-3 rounded-xl border border-cyan-400/35 bg-cyan-400/8 p-3 ring-1 ring-cyan-300/15">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Reglas de generación
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Solo se guarda el polígono y estas reglas. El mapa no crea cientos de
          mesas dibujadas.
        </p>
      </div>

      <Field label="Nombre del Sector">
        <Input
          ref={nameRef}
          value={zone.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Campo Delantero, VIP Standing, Platea Sur"
        />
      </Field>

      <Field label="Color del Sector">
        <VenueSectorColorPicker
          value={zone.color}
          onChange={(color) => onChange({ color })}
        />
      </Field>

      <Field label="Precio Base">
        <PriceInput
          value={zone.price}
          onValueChange={(value) => {
            if (value == null) return
            onChange({ price: value })
          }}
        />
      </Field>

      <Field label="Modalidad del sector">
        <select
          value={zone.seatingType ?? (zone.layoutType === "general" ? "GENERAL" : "RESERVED")}
          onChange={(event) => {
            const seatingType = event.target.value === "RESERVED" ? "RESERVED" : "GENERAL"
            onChange(
              seatingFieldsForLayoutType(
                seatingType === "GENERAL"
                  ? "general"
                  : zone.layoutType === "numbered_seat"
                    ? "numbered_seat"
                    : "table_combo",
              ),
            )
          }}
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="GENERAL">Entrada general (aforo)</option>
          <option value="RESERVED">Numerado (mesas y sillas)</option>
        </select>
      </Field>

      {(zone.seatingType ?? (zone.layoutType === "general" ? "GENERAL" : "RESERVED")) ===
      "RESERVED" ? (
      <Field label="Tipo de inventario">
        <select
          value={zone.layoutType === "numbered_seat" ? "numbered_seat" : "table_combo"}
          onChange={(event) => {
            const layoutType = event.target.value as VenueMapZone["layoutType"]
            onChange(seatingFieldsForLayoutType(layoutType === "numbered_seat" ? "numbered_seat" : "table_combo"))
          }}
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="table_combo">Mesas / tablones</option>
          <option value="numbered_seat">Butacas numeradas</option>
        </select>
      </Field>
      ) : null}

      {isTableInventory ? (
        <VenuePriceModeControl
          id={zone.id}
          value={zone.priceMode ?? venuePriceModeFromSellMode(zone.sellMode)}
          onChange={(next) => onChange(next)}
        />
      ) : null}

      {zone.layoutType === "general" ? (
        <Field label="Capacidad Maxima">
          <Input
            type="number"
            min={1}
            max={100000}
            value={zone.capacity}
            onChange={(event) =>
              onChange({ capacity: Number(event.target.value) || 1 })
            }
          />
        </Field>
      ) : (
        <>
          {isNumberedSeats ? (
            <>
              <Field label="Cantidad de filas">
                <div className="relative">
                  <Rows3
                    className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-cyan-300"
                    aria-hidden="true"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    value={numberedRows.length}
                    className="pl-8"
                    onChange={(event) =>
                      emitNumberedRows(
                        resizeRowsConfig(
                          numberedRows,
                          Number(event.target.value) || 1,
                        ),
                      )
                    }
                  />
                </div>
              </Field>
              <VenueRowsConfigEditor
                rowsConfig={numberedRows}
                onChange={emitNumberedRows}
              />
            </>
          ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cantidad de filas">
              <div className="relative">
                <Rows3
                  className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-cyan-300"
                  aria-hidden="true"
                />
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={zone.rows}
                  className="pl-8"
                  onChange={(event) =>
                    onChange({ rows: Number(event.target.value) || 1 })
                  }
                />
              </div>
            </Field>
            <Field label="Mesas por fila">
              <div className="relative">
                <Table2
                  className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-cyan-300"
                  aria-hidden="true"
                />
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={zone.itemsPerRow}
                  className="pl-8"
                  onChange={(event) =>
                    onChange({ itemsPerRow: Number(event.target.value) || 1 })
                  }
                />
              </div>
            </Field>
          </div>
          )}
          {isTableInventory ? (
            <Field label="Personas por mesa / tablón">
              <Input
                type="number"
                min={1}
                max={100}
                value={zone.capacityPerUnit}
                onChange={(event) =>
                  onChange({
                    capacityPerUnit: Number(event.target.value) || 1,
                  })
                }
              />
            </Field>
          ) : null}
          <Field label="Numeración">
            <div className="relative">
              <Hash
                className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-cyan-300"
                aria-hidden="true"
              />
              <Input
                value={zone.labelPrefix}
                className="pl-8"
                onChange={(event) => onChange({ labelPrefix: event.target.value })}
                placeholder={isNumberedSeats ? "Butaca " : "Mesa "}
              />
            </div>
          </Field>
        </>
      )}

      <p className="rounded-lg bg-background/70 px-3 py-2 text-sm text-muted-foreground">
        Inventario estimado:{" "}
        <span className="font-semibold text-foreground">
          {units} {zone.layoutType === "numbered_seat" ? "butacas" : zone.layoutType === "general" ? "accesos" : "unidades"}
        </span>
        {zone.layoutType === "table_combo" ? (
          <>
            {" "}
            · {estimated} personas
          </>
        ) : null}
        {zone.price > 0 ? (
          <>
            {" "}
            · {formatCurrency(zone.price)}
          </>
        ) : null}
      </p>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
