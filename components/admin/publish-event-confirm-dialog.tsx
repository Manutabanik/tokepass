"use client"

import { CheckCircle2, LoaderCircle, Rocket } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { publishEvent } from "@/app/actions/events"
import {
  EVENT_SENT_TO_REVIEW_BODY,
  EVENT_SENT_TO_REVIEW_TITLE,
} from "@/lib/events/review-status"
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
  const [pending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [purged, setPurged] = useState(0)

  function handleOpenChange(next: boolean) {
    if (!next) {
      if (submitted) onPublished?.({ purgedTestTickets: purged })
      setSubmitted(false)
      setPurged(0)
    }
    onOpenChange(next)
  }

  function sendToReview() {
    startTransition(async () => {
      const result = await publishEvent(eventId, { purgeTestTickets: true })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSubmitted(true)
      setPurged(result.purgedTestTickets ?? 0)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-md">
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <CheckCircle2
                  className="size-5 text-emerald-600 dark:text-emerald-300"
                  aria-hidden="true"
                />
                {EVENT_SENT_TO_REVIEW_TITLE}
              </DialogTitle>
              <DialogDescription className="text-pretty text-sm leading-6 text-muted-foreground">
                {EVENT_SENT_TO_REVIEW_BODY}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                className="h-11 w-full rounded-xl"
                onClick={() => handleOpenChange(false)}
              >
                Entendido
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Rocket
                  className="size-4 text-emerald-800 dark:text-emerald-300"
                  aria-hidden="true"
                />
                Publicar evento
              </DialogTitle>
              <DialogDescription className="text-pretty text-sm leading-6 text-muted-foreground">
                Al publicar, el evento pasa a revisión de TokePass. No se
                muestra en la cartelera ni acepta cobros hasta que el equipo lo
                apruebe. No pedimos CUIT ni DNI en este paso.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                type="button"
                disabled={pending}
                className="h-11 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={sendToReview}
              >
                {pending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Rocket className="size-4" aria-hidden="true" />
                )}
                Enviar a revisión
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="h-10 w-full text-muted-foreground"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
