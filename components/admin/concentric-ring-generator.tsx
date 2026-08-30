"use client"

import { CircleDot, Layers } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import {
  generateConcentricRing,
  type ConcentricRingConfig,
  type RingElementKind,
} from "@/lib/seating/concentric-ring"
import type { VenueMapElement } from "@/types/venue-map"

const KIND_OPTIONS: Array<{ id: RingElementKind; label: string }> = [
  { id: "round_table", label: "Mesa chica (círculo)" },
  { id: "long_table", label: "Tablón largo (rectángulo)" },
  { id: "vip_chair", label: "Butaca tradicional" },
]

export function ConcentricRingGenerator({
  onGenerate,
  center,
}: {
  onGenerate: (elements: VenueMapElement[], replaceGroupId: string) => void
  center?: { x: number; y: number } | null
}) {
  const [groupName, setGroupName] = useState("Grada Naranja")
  const [color, setColor] = useState("#ea580c")
  const [startAngle, setStartAngle] = useState(-60)
  const [endAngle, setEndAngle] = useState(60)
  const [innerRadius, setInnerRadius] = useState(90)
  const [outerRadius, setOuterRadius] = useState(240)
  const [rows, setRows] = useState(6)
  const [defaultKind, setDefaultKind] = useState<RingElementKind>("round_table")
  const [manualCounts, setManualCounts] = useState(false)
  const [countValue, setCountValue] = useState(18)
  const [aisle, setAisle] = useState(true)
  const [aisleWidthDeg, setAisleWidthDeg] = useState(14)
  const [price, setPrice] = useState(45000)
  const [centerX, setCenterX] = useState(center?.x ?? 400)
  const [centerY, setCenterY] = useState(center?.y ?? 470)
  useEffect(() => {
    if (center == null) return
    setCenterX(center.x)
    setCenterY(center.y)
  }, [center])

  const config = useMemo<ConcentricRingConfig>(() => {
    const safeRows = Math.min(40, Math.max(1, rows))
    const groupId = `grada-${groupName
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "naranja"}`
    return {
      groupId,
      groupName,
      color,
      centerX,
      centerY,
      startAngle,
      endAngle,
      innerRadius,
      outerRadius,
      rows: safeRows,
      rowTypes: Array.from({ length: safeRows }, () => defaultKind),
      countPerRow: Array.from({ length: safeRows }, () =>
        manualCounts ? countValue : "auto",
      ),
      aisle,
      aisleWidthDeg,
      aisleCenterDeg: (startAngle + endAngle) / 2,
      price,
    }
  }, [
    aisle,
    aisleWidthDeg,
    centerX,
    centerY,
    color,
    countValue,
    defaultKind,
    endAngle,
    groupName,
    innerRadius,
    manualCounts,
    outerRadius,
    price,
    rows,
    startAngle,
  ])

  const preview = useMemo(() => generateConcentricRing(config), [config])

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-emerald-400" />
        <p className="text-sm font-semibold text-foreground">Gradería anular</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Herradura, anfiteatro o abanico. Los anillos internos alojan menos
        piezas que los externos para que mesas y tablones no se pisen.
      </p>
      <Field label="Nombre de la grada">
        <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
      </Field>
      <Field label="Color">
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-transparent"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ángulo inicio">
          <Input
            type="number"
            value={startAngle}
            onChange={(event) => setStartAngle(Number(event.target.value))}
          />
        </Field>
        <Field label="Ángulo fin">
          <Input
            type="number"
            value={endAngle}
            onChange={(event) => setEndAngle(Number(event.target.value))}
          />
        </Field>
        <Field label="Radio interno">
          <Input
            type="number"
            min={20}
            value={innerRadius}
            onChange={(event) => setInnerRadius(Number(event.target.value) || 20)}
          />
        </Field>
        <Field label="Radio externo">
          <Input
            type="number"
            min={30}
            value={outerRadius}
            onChange={(event) => setOuterRadius(Number(event.target.value) || 30)}
          />
        </Field>
        <Field label="Filas / niveles">
          <Input
            type="number"
            min={1}
            max={40}
            value={rows}
            onChange={(event) => setRows(Number(event.target.value) || 1)}
          />
        </Field>
        <Field label="Precio (ARS)">
          <PriceInput
            min={0}
            value={price}
            onValueChange={(value) => {
              if (value == null) return
              setPrice(value)
            }}
          />
        </Field>
      </div>
      <Field label="Tipo por fila">
        <select
          value={defaultKind}
          onChange={(event) =>
            setDefaultKind(event.target.value as RingElementKind)
          }
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={manualCounts}
          onChange={(event) => setManualCounts(event.target.checked)}
        />
        Cantidad manual por fila
      </label>
      {manualCounts ? (
        <Field label="Elementos por fila">
          <Input
            type="number"
            min={1}
            max={240}
            value={countValue}
            onChange={(event) => setCountValue(Number(event.target.value) || 1)}
          />
        </Field>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={aisle}
          onChange={(event) => setAisle(event.target.checked)}
        />
        Pasillo central (rampa libre)
      </label>
      {aisle ? (
        <Field label={`Ancho del pasillo (${aisleWidthDeg}°)`}>
          <input
            type="range"
            min={4}
            max={40}
            value={aisleWidthDeg}
            onChange={(event) => setAisleWidthDeg(Number(event.target.value))}
            className="w-full accent-emerald-500"
          />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Centro X">
          <Input
            type="number"
            value={centerX}
            onChange={(event) => setCenterX(Number(event.target.value) || 0)}
          />
        </Field>
        <Field label="Centro Y">
          <Input
            type="number"
            value={centerY}
            onChange={(event) => setCenterY(Number(event.target.value) || 0)}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Vista previa: {preview.length} elementos. La cantidad por anillo se
        recorta si no hay espacio.
      </p>
      <Button
        type="button"
        className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
        onClick={() => onGenerate(preview, config.groupId)}
        disabled={preview.length === 0}
      >
        <CircleDot className="size-4" />
        Generar gradería
      </Button>
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
      <Label className="text-[11px] text-zinc-500">{label}</Label>
      {children}
    </div>
  )
}
