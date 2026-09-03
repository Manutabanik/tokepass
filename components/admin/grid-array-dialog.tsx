"use client"

import { LayoutGrid } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  clampGridArraySize,
  GRID_ARRAY_MAX_ITEMS,
  gridArrayLabelAt,
  gridArrayPiecesOverlap,
  gridArrayPitch,
  type GridArrayArea,
  type GridArrayKind,
} from "@/lib/seating/venue-array"

const KIND_OPTIONS: Array<{ id: GridArrayKind; label: string }> = [
  { id: "round_table", label: "Mesa redonda" },
  { id: "long_table", label: "Tablón" },
  { id: "vip_chair", label: "Butaca" },
]

export type GridArrayDialogValues = {
  type: GridArrayKind
  rows: number
  columns: number
  groupName: string
  /** Vacío: las piezas se estampan sin nombre a la vista. */
  prefix: string
  start: number
}

const EMPTY_AREA: GridArrayArea = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

export function GridArrayDialog({
  open,
  onOpenChange,
  onGenerate,
  area,
  takenLabels = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerate: (values: GridArrayDialogValues) => void
  /** Caja dibujada en el lienzo: define la separación entre piezas. */
  area: GridArrayArea | null
  /** Nombres ya usados en el plano, para avisar si la numeración se solapa. */
  takenLabels?: string[]
}) {
  const [type, setType] = useState<GridArrayKind>("round_table")
  const [rows, setRows] = useState(4)
  const [columns, setColumns] = useState(6)
  const [groupName, setGroupName] = useState("Bloque")
  const [prefix, setPrefix] = useState("")
  const [start, setStart] = useState(1)

  const size = useMemo(
    () => clampGridArraySize(rows, columns),
    [columns, rows],
  )
  const total = size.rows * size.columns
  const clamped = size.rows !== rows || size.columns !== columns
  const pitch = useMemo(
    () =>
      gridArrayPitch({
        rows: size.rows,
        columns: size.columns,
        area: area ?? EMPTY_AREA,
      }),
    [area, size.columns, size.rows],
  )
  const overlaps = Boolean(area) && gridArrayPiecesOverlap(type, pitch)
  const firstName = gridArrayLabelAt({ prefix, start }, 0)
  const lastName = gridArrayLabelAt({ prefix, start }, total - 1)
  const collisions = useMemo(() => {
    if (!firstName) return 0
    const taken = new Set(
      takenLabels.map((label) => label.trim().toLowerCase()),
    )
    let hits = 0
    for (let index = 0; index < total; index += 1) {
      const name = gridArrayLabelAt({ prefix, start }, index)
      if (taken.has(name.trim().toLowerCase())) hits += 1
    }
    return hits
  }, [firstName, prefix, start, takenLabels, total])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg border-border bg-card text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-primary" aria-hidden="true" />
            Generar matriz
          </DialogTitle>
          <DialogDescription>
            Cada pieza se estampa como objeto independiente dentro del área que
            dibujaste. Después podés mover o borrar cualquiera para ajustar
            bordes en diagonal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="grid-array-type">Elemento</Label>
            <select
              id="grid-array-type"
              value={type}
              onChange={(event) =>
                setType(event.target.value as GridArrayKind)
              }
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grid-array-name">Nombre del bloque</Label>
            <Input
              id="grid-array-name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Platea"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="grid-array-rows">Filas</Label>
              <Input
                id="grid-array-rows"
                type="number"
                min={1}
                max={80}
                value={rows}
                onChange={(event) =>
                  setRows(Number(event.target.value) || 1)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grid-array-cols">Columnas</Label>
              <Input
                id="grid-array-cols"
                type="number"
                min={1}
                max={80}
                value={columns}
                onChange={(event) =>
                  setColumns(Number(event.target.value) || 1)
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="grid-array-prefix">
                Prefijo{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Input
                id="grid-array-prefix"
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="Mesa"
              />
            </div>
            <div className="w-28 space-y-1.5">
              <Label htmlFor="grid-array-start">N° de inicio</Label>
              <Input
                id="grid-array-start"
                type="number"
                min={1}
                value={start}
                disabled={!prefix.trim()}
                onChange={(event) => setStart(Number(event.target.value) || 1)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {firstName
              ? `Se van a llamar ${firstName} … ${lastName}, de izquierda a derecha y de arriba abajo.`
              : "Sin prefijo las piezas se estampan sin nombre a la vista. Podés nombrarlas de a una en el panel derecho."}
          </p>
          {collisions > 0 ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Ya hay {collisions} {collisions === 1 ? "pieza" : "piezas"} con
              esos nombres en el plano. Subí el número de inicio para no repetir
              lo que después se imprime en el boleto.
            </p>
          ) : null}
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Separación calculada del área dibujada:{" "}
            <span className="font-medium text-foreground">
              {Math.round(pitch.x)} × {Math.round(pitch.y)} px
            </span>{" "}
            entre centros.
          </p>
          <p className="text-xs text-muted-foreground">
            Se van a crear <span className="font-medium text-foreground">{total}</span>{" "}
            elementos
            {clamped
              ? ` (máximo ${GRID_ARRAY_MAX_ITEMS}; se ajustó a ${size.rows}×${size.columns})`
              : null}
            .
          </p>
          {overlaps ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Con esa cantidad las piezas se van a superponer. Bajá filas o
              columnas, o dibujá un área más grande.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!area}
            onClick={() => {
              onGenerate({
                type,
                rows: size.rows,
                columns: size.columns,
                groupName,
                prefix,
                start,
              })
            }}
          >
            Estampar en el área
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
