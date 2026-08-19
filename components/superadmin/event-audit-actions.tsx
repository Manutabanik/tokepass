"use client"

import { Check, LoaderCircle, MessageSquare, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  approveEventForPublication,
  rejectEventForPublication,
  requestEventRevision,
} from "@/app/actions/event-audit"
import { Button } from "@/components/ui/button"

export function EventAuditActions({
  eventId,
}: {
  eventId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      const result = await approveEventForPublication(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Evento aprobado y publicado")
      router.refresh()
    })
  }

  function requestChanges() {
    startTransition(async () => {
      const result = await requestEventRevision(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Pedido de cambios enviado")
      if (result.threadId) {
        router.push(`/superadmin/soporte?thread=${result.threadId}`)
        return
      }
      router.push("/superadmin/soporte")
    })
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectEventForPublication(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Evento rechazado")
      router.refresh()
    })
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Button
        type="button"
        disabled={pending}
        className="h-11 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
        onClick={approve}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        Aprobar y Publicar
      </Button>
      <Button
        type="button"
        disabled={pending}
        className="h-11 rounded-xl bg-amber-500 font-semibold text-amber-950 hover:bg-amber-400"
        onClick={requestChanges}
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        Solicitar Cambios
      </Button>
      <Button
        type="button"
        disabled={pending}
        className="h-11 rounded-xl bg-rose-600 font-semibold text-white hover:bg-rose-500"
        onClick={reject}
      >
        <X className="size-4" aria-hidden="true" />
        Rechazar Evento
      </Button>
    </div>
  )
}
