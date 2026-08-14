"use client"

import { Copy, Edit3, Hash, RotateCw, Trash2 } from "lucide-react"
import { useState } from "react"

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function VenueCanvasContextMenu({
  open,
  x,
  y,
  canRotate,
  canDuplicate,
  canRenumber,
  onOpenChange,
  onEdit,
  onDuplicate,
  onRotate,
  onRenumber,
  onDelete,
}: {
  open: boolean
  x: number
  y: number
  canRotate: boolean
  canDuplicate: boolean
  canRenumber: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onRotate: () => void
  onRenumber: (value: string) => void
  onDelete: () => void
}) {
  const [renumbering, setRenumbering] = useState(false)
  const [numberDraft, setNumberDraft] = useState("")

  return (
    <ContextMenu
      open={open}
      x={x}
      y={y}
      onOpenChange={(next) => {
        if (!next) setRenumbering(false)
        onOpenChange(next)
      }}
    >
      {renumbering ? (
        <div className="space-y-2 px-2 py-2" onPointerDown={(event) => event.stopPropagation()}>
          <p className="text-xs font-medium text-muted-foreground">Número de mesa o asiento</p>
          <Input
            autoFocus
            value={numberDraft}
            onChange={(event) => setNumberDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRenumber(numberDraft)
                setRenumbering(false)
                onOpenChange(false)
              }
            }}
            placeholder="Ej. Mesa 14"
          />
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => {
              onRenumber(numberDraft)
              setRenumbering(false)
              onOpenChange(false)
            }}
          >
            Guardar número
          </Button>
        </div>
      ) : (
        <>
          <ContextMenuItem
            onSelect={() => {
              onEdit()
              onOpenChange(false)
            }}
          >
            <Edit3 className="h-4 w-4" />
            Editar propiedades
          </ContextMenuItem>
          {canDuplicate ? (
            <ContextMenuItem
              onSelect={() => {
                onDuplicate()
                onOpenChange(false)
              }}
            >
              <Copy className="h-4 w-4" />
              Duplicar / Clonar
            </ContextMenuItem>
          ) : null}
          {canRotate ? (
            <ContextMenuItem
              onSelect={() => {
                onRotate()
                onOpenChange(false)
              }}
            >
              <RotateCw className="h-4 w-4" />
              Girar 90°
            </ContextMenuItem>
          ) : null}
          {canRenumber ? (
            <ContextMenuItem
              onSelect={() => {
                setNumberDraft("")
                setRenumbering(true)
              }}
            >
              <Hash className="h-4 w-4" />
              Cambiar numeración
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-red-600 dark:text-red-400"
            onSelect={() => {
              onDelete()
              onOpenChange(false)
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
            Eliminar
          </ContextMenuItem>
        </>
      )}
    </ContextMenu>
  )
}
