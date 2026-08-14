"use client"

import { CheckCircle, Hash } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  applyAutoNumbering,
  type AutoNumberDirection,
} from "@/lib/seating/auto-numbering"
import type { VenueMapElement } from "@/types/venue-map"

export function AutoNumberingPanel({
  elements,
  selectedIds,
  onApply,
}: {
  elements: VenueMapElement[]
  selectedIds: string[]
  onApply: (next: VenueMapElement[]) => void
}) {
  const [start, setStart] = useState(1)
  const [prefix, setPrefix] = useState("M-")
  const [suffix, setSuffix] = useState("")
  const [direction, setDirection] = useState<AutoNumberDirection>("ltr")
  const [done, setDone] = useState(false)

  const count = selectedIds.length

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Hash className="size-4 text-emerald-400" />
        <p className="text-sm font-semibold text-foreground">Numeración correlativa</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {count > 0
          ? `${count} elementos seleccionados. Se asignan etiquetas únicas 1 a N.`
          : "Selecciona una grada o un grupo de mesas/tablones en el plano."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-zinc-500">Inicio</Label>
          <Input
            type="number"
            min={1}
            value={start}
            onChange={(event) => setStart(Number(event.target.value) || 1)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-zinc-500">Dirección</Label>
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
          <Label className="text-[11px] text-zinc-500">Prefijo</Label>
          <Input value={prefix} onChange={(event) => setPrefix(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-zinc-500">Sufijo</Label>
          <Input value={suffix} onChange={(event) => setSuffix(event.target.value)} />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
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
          setDone(true)
          window.setTimeout(() => setDone(false), 1600)
        }}
      >
        {done ? <CheckCircle className="size-4 text-emerald-400" /> : <Hash className="size-4" />}
        Numerar seleccion
      </Button>
    </div>
  )
}
