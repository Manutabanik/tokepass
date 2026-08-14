"use client"

import { FlaskConical, LoaderCircle, Rocket, TriangleAlert } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { countEventTestTickets, publishEvent } from "@/app/actions/events"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type PublishEventConfirmDialogProps = {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished?: (result: { purgedTestTickets: number }) => void
}

export function PublishEventConfirmDialog({
  eventId,
  open,
  onOpenChange,
  onPublished,
}: PublishEventConfirmDialogProps) {
  const [testCount, setTestCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingCount(true)
    void countEventTestTickets(eventId)
      .then((count) => {
        if (!cancelled) setTestCount(count)
      })
      .finally(() => {
        if (!cancelled) setLoadingCount(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, open])

  function runPublish(purgeTestTickets: boolean) {
    startTransition(async () => {
      const result = await publishEvent(eventId, { purgeTestTickets })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const purged = result.purgedTestTickets ?? 0
      toast.success("Evento publicado", {
        description:
          purged > 0
            ? `Se eliminaron ${purged} entrada${purged === 1 ? "" : "s"} de prueba.`
            : "Ya es visible en el catálogo y acepta compras.",
      })
      onOpenChange(false)
      onPublished?.({ purgedTestTickets: purged })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Rocket className="size-4 text-emerald-800 dark:text-emerald-300" aria-hidden="true" />
            Publicar evento
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Al publicar, el evento queda visible en el catálogo. Las entradas de
            prueba del borrador no sirven en puerta en vivo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          <p className="flex items-start gap-2 font-medium">
            <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {loadingCount
              ? "Buscando entradas de prueba…"
              : testCount > 0
                ? `Hay ${testCount} entrada${testCount === 1 ? "" : "s"} de prueba de este borrador.`
                : "No hay entradas de prueba en este borrador."}
          </p>
          <p className="mt-2 flex items-start gap-2 text-amber-100/80">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ¿Querés purgar todas las entradas de prueba generadas durante el
            borrador?
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={pending || loadingCount}
            className="h-11 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => runPublish(true)}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Rocket className="size-4" aria-hidden="true" />
            )}
            Publicar y purgar pruebas
          </Button>
          <Button
            type="button"
            disabled={pending || loadingCount}
            variant="outline"
            className="h-11 w-full rounded-xl border-zinc-300 dark:border-zinc-700"
            onClick={() => runPublish(false)}
          >
            Publicar sin purgar
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="h-10 w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
