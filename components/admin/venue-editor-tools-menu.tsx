"use client"

import { useState, type PointerEvent } from "react"
import {
  ChevronDown,
  Eye,
  FlaskConical,
  LayoutTemplate,
  LoaderCircle,
  Minus,
  Save,
  Square,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { blurActiveElement } from "@/lib/dom/blur-active-element"
import {
  EDITOR_PURGE_TEST_CONFIRM,
  EDITOR_PURGE_TEST_LABEL,
} from "@/lib/seating/editor-test-purge"
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
  canPurgeTestPurchases = false,
  purgingTestPurchases = false,
  onPurgeTestPurchases,
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
  canPurgeTestPurchases?: boolean
  purgingTestPurchases?: boolean
  onPurgeTestPurchases?: () => Promise<boolean> | boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)

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
          {canPurgeTestPurchases ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={purgingTestPurchases}
                onClick={() => {
                  blurActiveElement()
                  setConfirmPurge(true)
                }}
              >
                <FlaskConical className="size-4" />
                {EDITOR_PURGE_TEST_LABEL}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canPurgeTestPurchases ? (
        <Dialog
          modal={false}
          open={confirmPurge}
          onOpenChange={(next) => {
            if (purgingTestPurchases) return
            if (next) blurActiveElement()
            setConfirmPurge(next)
          }}
        >
          <DialogContent
            className="z-[220] border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            overlayClassName="z-[210] bg-black/40 backdrop-blur-[2px]"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FlaskConical className="size-4 text-amber-600" aria-hidden="true" />
                Purgar compras de prueba
              </DialogTitle>
              <DialogDescription>{EDITOR_PURGE_TEST_CONFIRM}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                disabled={purgingTestPurchases}
                onClick={() => setConfirmPurge(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={purgingTestPurchases}
                onClick={() => {
                  void Promise.resolve(onPurgeTestPurchases?.()).then((ok) => {
                    if (ok !== false) setConfirmPurge(false)
                  })
                }}
              >
                {purgingTestPurchases ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FlaskConical className="size-4" aria-hidden="true" />
                )}
                Liberar mesas
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
