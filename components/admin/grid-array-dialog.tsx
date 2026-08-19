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
  type GridArrayKind,
} from "@/lib/seating/venue-array"

const KIND_OPTIONS: Array<{ id: GridArrayKind; label: string }> = [
  { id: "vip_chair", label: "Silla / butaca" },
  { id: "round_table", label: "Mesa redonda" },
  { id: "long_table", label: "Tablón" },
]

export type GridArrayDialogValues = {
  type: GridArrayKind
  rows: number
  columns: number
  gap: number
  groupName: string
}

export function GridArrayDialog({
  open,
  onOpenChange,
  onGenerate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerate: (values: GridArrayDialogValues) => void
}) {
  const [type, setType] = useState<GridArrayKind>("vip_chair")
  const [rows, setRows] = useState(10)
  const [columns, setColumns] = useState(12)
  const [gap, setGap] = useState(4)
  const [groupName, setGroupName] = useState("Platea")

  const size = useMemo(
    () => clampGridArraySize(rows, columns),
    [columns, rows],
  )
  const total = size.rows * size.columns
  const clamped = size.rows !== rows || size.columns !== columns

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-primary" aria-hidden="true" />
            Generar matriz
          </DialogTitle>
          <DialogDescription>
            Crea un bloque alineado de sillas o mesas. Después podés numerarlo
            como teatro o alinearlo en curva.
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
          <div className="space-y-1.5">
            <Label htmlFor="grid-array-gap">
              Separación extra (gap) · {gap} px
            </Label>
            <Input
              id="grid-array-gap"
              type="number"
              min={0}
              max={80}
              value={gap}
              onChange={(event) => setGap(Number(event.target.value) || 0)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Se van a crear <span className="font-medium text-foreground">{total}</span>{" "}
            elementos
            {clamped
              ? ` (máximo ${GRID_ARRAY_MAX_ITEMS}; se ajustó a ${size.rows}×${size.columns})`
              : null}
            .
          </p>
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
            onClick={() => {
              onGenerate({
                type,
                rows: size.rows,
                columns: size.columns,
                gap,
                groupName,
              })
            }}
          >
            Generar bloque
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
