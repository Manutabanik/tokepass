"use client"

import { CheckCircle, Hash } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  applyAutoNumbering,
  applyMatrixNumbering,
  type AutoNumberDirection,
  type MatrixAisleMode,
  type MatrixRowAxis,
} from "@/lib/seating/auto-numbering"
import { cn } from "@/lib/utils"
import type { VenueMapElement } from "@/types/venue-map"

type NumberMode = "correlative" | "matrix"

export function AutoNumberingPanel({
  elements,
  selectedIds,
  onApply,
}: {
  elements: VenueMapElement[]
  selectedIds: string[]
  onApply: (next: VenueMapElement[]) => void
}) {
  const [mode, setMode] = useState<NumberMode>("matrix")
  const [start, setStart] = useState(1)
  const [prefix, setPrefix] = useState("M-")
  const [suffix, setSuffix] = useState("")
  const [direction, setDirection] = useState<AutoNumberDirection>("ltr")
  const [rowAxis, setRowAxis] = useState<MatrixRowAxis>("letters")
  const [aisleMode, setAisleMode] = useState<MatrixAisleMode>("sequential")
  const [done, setDone] = useState(false)

  const count = selectedIds.length
  const theatreAisle = aisleMode === "theatre_odds_evens"

  function flashDone() {
    setDone(true)
    window.setTimeout(() => setDone(false), 1600)
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Hash className="size-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">
          Numeración Inteligente
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {count > 0
          ? `${count} elementos. Las etiquetas bloqueadas (doble clic o clic derecho) no se recalculan.`
          : "Seleccioná un bloque de butacas o mesas en el plano."}
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={mode === "matrix" ? "default" : "outline"}
          className="min-h-[40px]"
          onClick={() => setMode("matrix")}
        >
          Teatro / matriz
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "correlative" ? "default" : "outline"}
          className="min-h-[40px]"
          onClick={() => setMode("correlative")}
        >
          Correlativa
        </Button>
      </div>

      {mode === "matrix" ? (
        <>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Eje Y (filas)
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={rowAxis === "letters" ? "secondary" : "outline"}
                className={cn("min-h-[40px]", rowAxis === "letters" && "ring-1 ring-primary/40")}
                onClick={() => setRowAxis("letters")}
              >
                Letras (A, B, C)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rowAxis === "numbers" ? "secondary" : "outline"}
                className={cn("min-h-[40px]", rowAxis === "numbers" && "ring-1 ring-primary/40")}
                onClick={() => setRowAxis("numbers")}
              >
                Números (1, 2, 3)
              </Button>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Eje X: asientos 1, 2, 3… de izquierda a derecha, o pares/impares
            desde el centro.
          </p>
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <Label
              htmlFor="theatre-aisle-mode"
              className="text-xs leading-snug text-foreground"
            >
              Teatro (pares a un lado, impares al otro)
            </Label>
            <Switch
              id="theatre-aisle-mode"
              size="sm"
              checked={theatreAisle}
              onCheckedChange={(checked) =>
                setAisleMode(checked ? "theatre_odds_evens" : "sequential")
              }
              aria-label="Teatro pares a un lado e impares al otro"
            />
          </div>
          <Button
            type="button"
            className="min-h-[44px] w-full"
            disabled={count === 0}
            onClick={() => {
              onApply(
                applyMatrixNumbering(elements, selectedIds, {
                  rowAxis,
                  aisleMode,
                }),
              )
              flashDone()
            }}
          >
            {done ? (
              <CheckCircle className="size-4 text-emerald-400" />
            ) : (
              <Hash className="size-4" />
            )}
            Aplicar numeración de teatro
          </Button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Inicio</Label>
              <Input
                type="number"
                min={1}
                value={start}
                onChange={(event) => setStart(Number(event.target.value) || 1)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Dirección
              </Label>
              <select
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as AutoNumberDirection)
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="ltr">Izquierda a derecha</option>
                <option value="rtl">Derecha a izquierda</option>
                <option value="inner_to_outer">Fila interna a externa</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Prefijo</Label>
              <Input
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Sufijo</Label>
              <Input
                value={suffix}
                onChange={(event) => setSuffix(event.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] w-full"
            disabled={count === 0}
            onClick={() => {
              onApply(
                applyAutoNumbering(elements, new Set(selectedIds), {
                  start,
                  prefix,
                  suffix,
                  direction,
                }),
              )
              flashDone()
            }}
          >
            {done ? (
              <CheckCircle className="size-4 text-emerald-400" />
            ) : (
              <Hash className="size-4" />
            )}
            Aplicar numeración correlativa
          </Button>
        </>
      )}
    </div>
  )
}
