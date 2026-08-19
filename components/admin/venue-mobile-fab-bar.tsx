"use client"

import {
  Lasso,
  Layers,
  Plus,
  Redo,
  SlidersHorizontal,
  Undo,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function VenueMobileFabBar({
  showAdd,
  showProperties,
  lassoMode,
  canUndo,
  canRedo,
  onAdd,
  onModes,
  onLasso,
  onUndo,
  onRedo,
  onProperties,
  className,
}: {
  showAdd: boolean
  showProperties: boolean
  lassoMode: boolean
  canUndo: boolean
  canRedo: boolean
  onAdd: () => void
  onModes: () => void
  onLasso: () => void
  onUndo: () => void
  onRedo: () => void
  onProperties: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-md",
        className,
      )}
    >
      {showAdd ? (
        <Button
          type="button"
          className="h-11 min-h-11 rounded-full px-3.5 touch-manipulation"
          onClick={onAdd}
        >
          <Plus className="size-4" aria-hidden="true" />
          Agregar
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="h-11 min-h-11 rounded-full px-3 touch-manipulation"
        onClick={onModes}
      >
        <Layers className="size-4" aria-hidden="true" />
        Modos
      </Button>
      <Button
        type="button"
        variant={lassoMode ? "default" : "secondary"}
        className="h-11 min-h-11 rounded-full px-3 touch-manipulation"
        aria-pressed={lassoMode}
        onClick={onLasso}
      >
        <Lasso className="size-4" aria-hidden="true" />
        Selección
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="size-11 rounded-full touch-manipulation"
        disabled={!canUndo}
        aria-label="Deshacer"
        onClick={onUndo}
      >
        <Undo className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="size-11 rounded-full touch-manipulation"
        disabled={!canRedo}
        aria-label="Rehacer"
        onClick={onRedo}
      >
        <Redo className="size-4" />
      </Button>
      {showProperties ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="size-11 rounded-full touch-manipulation"
          aria-label="Propiedades"
          onClick={onProperties}
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
