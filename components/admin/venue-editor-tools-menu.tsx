"use client"

import { useState, type PointerEvent } from "react"
import {
  ChevronDown,
  Eye,
  LayoutTemplate,
  Minus,
  Save,
  Square,
  Trash2,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { blurActiveElement } from "@/lib/dom/blur-active-element"
import { cn } from "@/lib/utils"

function stopCanvas(event: PointerEvent<HTMLElement>) {
  event.stopPropagation()
}

export function VenueEditorToolsMenu({
  geometryLocked,
  pendingTemplates,
  onAddStage,
  onAddAisle,
  onOpenLibrary,
  onSaveTemplate,
  onPreview,
  onClearMap,
  className,
}: {
  geometryLocked: boolean
  pendingTemplates?: boolean
  onAddStage: () => void
  onAddAisle: () => void
  onOpenLibrary: () => void
  onSaveTemplate: () => void
  onPreview: () => void
  onClearMap: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn("pointer-events-auto absolute top-4 right-4 z-[120]", className)}
      data-editor-chrome
      onPointerDown={stopCanvas}
    >
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (next) blurActiveElement()
          setOpen(next)
        }}
      >
        <DropdownMenuTrigger
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card/85 px-3 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md hover:bg-card"
        >
          Herramientas
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48" onPointerDown={stopCanvas}>
          {geometryLocked ? null : (
            <>
              <DropdownMenuItem onClick={onAddStage}>
                <Square className="size-4" />
                Agregar escenario
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddAisle}>
                <Minus className="size-4" />
                Agregar pasillo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenLibrary}>
                <LayoutTemplate className="size-4" />
                Plantillas
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={onSaveTemplate} disabled={pendingTemplates}>
            <Save className="size-4" />
            Guardar como plantilla
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onPreview}>
            <Eye className="size-4" />
            Vista previa del comprador
          </DropdownMenuItem>
          {geometryLocked ? null : (
            <DropdownMenuItem onClick={onClearMap}>
              <Trash2 className="size-4" />
              Limpiar Mapa
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
