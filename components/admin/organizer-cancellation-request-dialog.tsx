"use client"

import { LoaderCircle, ShieldAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { OrganizerEvent } from "@/app/actions/events"
import { requestEventCancellationSupport } from "@/app/actions/support"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

export function OrganizerCancellationRequestDialog({
  event,
  open,
  onOpenChange,
}: {
  event: OrganizerEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  function handleClose(next: boolean) {
    if (!next) setReason("")
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            Solicitar cancelación
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {event
              ? `“${event.title}” está publicado. No se elimina ni se devuelve la plata desde acá. Super Admin revisa el motivo y, si corresponde, ejecuta la cancelación con MFA.`
              : "Este evento está publicado."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label
            htmlFor="organizer-cancel-reason"
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Motivo
          </label>
          <Textarea
            id="organizer-cancel-reason"
            value={reason}
            onChange={(eventChange) => setReason(eventChange.target.value)}
            disabled={pending}
            minLength={12}
            rows={4}
            placeholder="Ej: se suspendió por clima / disposición municipal"
            className="min-h-28"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-border"
            disabled={pending}
            onClick={() => handleClose(false)}
          >
            Volver
          </Button>
          <Button
            type="button"
            disabled={pending || !event || reason.trim().length < 12}
            className="bg-amber-600 text-white hover:bg-amber-500"
            onClick={() => {
              if (!event) return
              startTransition(async () => {
                const result = await requestEventCancellationSupport(
                  event.id,
                  reason,
                )
                if (!result.success) {
                  toast.error(result.error)
                  return
                }
                toast.success("Solicitud enviada", {
                  description:
                    "El evento quedó en Cancelación pedida. Super Admin procesa los reembolsos.",
                })
                handleClose(false)
                router.refresh()
              })
            }}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-4" aria-hidden="true" />
            )}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
