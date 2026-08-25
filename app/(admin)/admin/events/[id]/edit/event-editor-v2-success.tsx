"use client"

import { CheckCircle2, Copy, ExternalLink, LayoutDashboard } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DRAFT_DIALOG_CLASS } from "./event-editor-v2-ui"
import { salesDashboardPath } from "@/lib/events/editor-v2-ux"

const CONFETTI_COLORS = [
  "bg-emerald-400",
  "bg-amber-400",
  "bg-sky-400",
  "bg-rose-400",
  "bg-violet-400",
]

function SuccessConfetti() {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {Array.from({ length: 22 }, (_, index) => {
        const side = index % 2 === 0 ? 1 : -1
        return (
          <motion.span
            key={index}
            className={`absolute top-8 left-1/2 h-2.5 w-1.5 rounded-sm ${CONFETTI_COLORS[index % CONFETTI_COLORS.length]}`}
            initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            animate={{
              opacity: 0,
              x: side * (36 + (index % 7) * 18),
              y: 90 + (index % 5) * 28,
              rotate: side * (120 + index * 12),
              scale: 0.4,
            }}
            transition={{ duration: 1.15, ease: "easeOut", delay: index * 0.025 }}
          />
        )
      })}
    </div>
  )
}

export function EventEditorV2SuccessDialog({
  open,
  eventId,
  publicUrl,
  updated,
  onOpenChange,
}: {
  open: boolean
  eventId: string
  publicUrl: string
  updated: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [copying, setCopying] = useState(false)
  const salesHref = salesDashboardPath(eventId)

  async function copyLink() {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success("Link copiado")
    } catch {
      toast.error("No se pudo copiar el link.")
    } finally {
      setCopying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DRAFT_DIALOG_CLASS} overflow-hidden border-border bg-card text-foreground sm:max-w-lg`}>
        <SuccessConfetti />
        <DialogHeader className="relative items-center text-center sm:items-center">
          <div className="mx-auto mb-2 grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="size-8" aria-hidden />
          </div>
          <DialogTitle className="text-xl font-black tracking-tight">
            {updated ? "¡Evento actualizado!" : "¡Evento publicado!"}
          </DialogTitle>
          <DialogDescription>
            {updated
              ? "La boletería ya refleja el último borrador. Compartí el link o revisá las ventas."
              : "Ya está en Tokepass. Compartí el link o pasá al dashboard de ventas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              URL pública
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={publicUrl}
                aria-label="URL pública del evento"
                className="h-12 min-h-12 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 min-h-12 shrink-0"
                onClick={() => void copyLink()}
                disabled={copying || !publicUrl}
              >
                <Copy className="size-4" aria-hidden />
                Copiar Link
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 min-h-12"
              render={
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="size-4" aria-hidden />
              Ver evento en catálogo
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-12 min-h-12 bg-emerald-500 text-black hover:bg-emerald-400"
              render={<Link href={salesHref} />}
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Ir al Dashboard de Ventas
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
