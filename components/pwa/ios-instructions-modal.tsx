"use client"

import { Check, PlusSquare, Share, Smartphone } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { usePwaRuntimeStore } from "@/lib/stores/pwa-runtime-store"

type IosInstructionsModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function IosInstructionsModal({
  open,
  onOpenChange,
}: IosInstructionsModalProps = {}) {
  const storeOpen = usePwaRuntimeStore((state) => state.iosGuideOpen)
  const setIosGuideOpen = usePwaRuntimeStore((state) => state.setIosGuideOpen)
  const isOpen = open ?? storeOpen

  function handleOpenChange(next: boolean) {
    setIosGuideOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 px-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-1 mt-1 h-1 w-10 rounded-full bg-muted-foreground/25" />
        <SheetHeader className="border-0 px-5 pb-2 pt-2">
          <div className="mb-2 grid size-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
            <Smartphone className="size-5" aria-hidden="true" />
          </div>
          <SheetTitle className="text-lg font-bold tracking-tight">
            Instalá TokePass en tu iPhone
          </SheetTitle>
          <SheetDescription>
            Safari no muestra el botón nativo. En 2 pasos queda en tu pantalla
            de inicio, sin App Store.
          </SheetDescription>
        </SheetHeader>

        <ol className="space-y-3 px-5 pb-2 pt-3">
          <li className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sm font-bold text-sky-700 ring-1 ring-sky-500/30 dark:text-sky-300">
              1
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Share className="size-3.5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
                Toca Compartir
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Tocá el ícono Compartir en la barra inferior de Safari.
              </p>
            </div>
          </li>

          <li className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
              2
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <PlusSquare
                  className="size-3.5 text-violet-600 dark:text-violet-300"
                  aria-hidden="true"
                />
                Agregar a inicio
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Deslizá hacia abajo y seleccioná{" "}
                <span className="font-medium text-foreground">
                  Agregar a inicio
                </span>
                .
              </p>
            </div>
          </li>
        </ol>

        <p className="flex items-center justify-center gap-1.5 px-5 pt-2 text-center text-xs font-medium text-muted-foreground">
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Queda como app: entradas offline en un toque.
        </p>
      </SheetContent>
    </Sheet>
  )
}
