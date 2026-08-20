"use client"

import { CommercialCanvas } from "@/components/public/commercial-canvas"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CommercialCanvasModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92dvh,56rem)] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-white/10 bg-[#0a0a12] p-0 text-zinc-50 sm:max-w-5xl"
        overlayClassName="bg-black/70 supports-backdrop-filter:backdrop-blur-sm"
      >
        <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg font-black tracking-tight text-white sm:text-xl">
            Comparativa completa vs tiqueteras tradicionales
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            Matriz, Living QR de 15 segundos y recuperacion de barra por no-show.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 scrollbar-thin sm:px-6">
          {open ? <CommercialCanvas /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
