"use client"

import { Share, Smartphone } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type IosInstructionsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IosInstructionsModal({
  open,
  onOpenChange,
}: IosInstructionsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">
            Instalá Tokepass en tu iPhone
          </DialogTitle>
          <DialogDescription>
            Safari no muestra el botón nativo. En 2 pasos queda en tu pantalla
            de inicio, sin App Store.
          </DialogDescription>
        </DialogHeader>

        <ol className="mt-1 space-y-3">
          <li className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/30">
              1
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Share className="size-3.5 text-sky-300" aria-hidden="true" />
                Compartir
              </p>
              <p className="mt-1 text-sm leading-5 text-zinc-400">
                Presioná el botón de compartir en la barra inferior de Safari.
              </p>
            </div>
          </li>

          <li className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/30">
              2
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Smartphone
                  className="size-3.5 text-emerald-300"
                  aria-hidden="true"
                />
                Agregar a inicio
              </p>
              <p className="mt-1 text-sm leading-5 text-zinc-400">
                Desplazate hacia abajo y seleccioná{" "}
                <span className="font-medium text-zinc-200">
                  &ldquo;Agregar a inicio&rdquo;
                </span>
                .
              </p>
            </div>
          </li>
        </ol>

        <div
          className="relative mt-1 overflow-hidden rounded-2xl border border-border bg-muted/50 px-4 py-5"
          aria-hidden="true"
        >
          <div className="mx-auto flex max-w-[220px] flex-col items-center gap-3">
            <div className="flex w-full items-center justify-center gap-6 rounded-2xl bg-background px-4 py-3 ring-1 ring-border">
              <div className="flex flex-col items-center gap-1">
                <span className="grid size-10 place-items-center rounded-xl bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/35">
                  <Share className="size-5" />
                </span>
                <span className="text-[10px] font-medium text-zinc-500">
                  Compartir
                </span>
              </div>
              <span className="text-zinc-600">→</span>
              <div className="flex flex-col items-center gap-1">
                <span className="size-10 overflow-hidden rounded-xl bg-black ring-1 ring-violet-400/40">
                  <img
                    src="/brand/tokepass-mark.png"
                    alt=""
                    width={40}
                    height={40}
                    className="size-full object-cover"
                  />
                </span>
                <span className="text-[10px] font-medium text-zinc-500">
                  Tokepass
                </span>
              </div>
            </div>
            <p className="text-center text-[11px] leading-4 text-zinc-500">
              Queda como app: entradas offline y escáner listos en un toque.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
