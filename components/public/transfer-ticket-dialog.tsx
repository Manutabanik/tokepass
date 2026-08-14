"use client"

import { LoaderCircle, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { transferTicketAction } from "@/app/actions/transfer"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { removeTicketOffline } from "@/lib/offline-store"

export function TransferTicketDialog({
  ticketId,
  eventTitle,
  disabled = false,
  triggerLabel = "Enviar / Regalar a un amigo",
  triggerClassName,
}: {
  ticketId: string
  eventTitle: string
  disabled?: boolean
  triggerLabel?: string
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleTransfer() {
    if (isPending) return

    startTransition(async () => {
      try {
        const result = await transferTicketAction({
          ticketId,
          receiverEmail: email,
        })

        if (!result.success) {
          toast.error(result.error)
          return
        }

        toast.success(result.message, {
          description: `Se avisó a ${result.receiverEmail}`,
        })
        await removeTicketOffline(ticketId).catch(() => {})
        setOpen(false)
        setEmail("")
        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo transferir la entrada.",
        )
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "h-11 w-full rounded-full border border-emerald-500/35 bg-emerald-500/10 text-sm font-semibold text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-100"
        }
      >
        <Send className="size-4" aria-hidden="true" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transferir entrada</DialogTitle>
            <DialogDescription>
              Vas a regalar tu acceso a{" "}
              <span className="font-medium text-foreground">{eventTitle}</span>.
            </DialogDescription>
          </DialogHeader>

          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm leading-5 text-red-800 dark:text-red-100"
          >
            Al transferir esta entrada, el código QR de tu teléfono quedará{" "}
            <strong className="font-semibold">
              ANULADO de forma permanente
            </strong>{" "}
            y se emitirá uno nuevo para el destinatario. Esta acción no se puede
            deshacer.
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`transfer-email-${ticketId}`}
              className="text-foreground"
            >
              Email del destinatario
            </Label>
            <Input
              id={`transfer-email-${ticketId}`}
              type="email"
              autoComplete="email"
              placeholder="amigo@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isPending}
              className="border-border bg-background"
            />
          </div>

          <DialogFooter className="sm:justify-stretch">
            <Button
              type="button"
              disabled={isPending || !email.trim()}
              onClick={handleTransfer}
              className="h-11 w-full rounded-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              {isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Transfiriendo…
                </>
              ) : (
                "Confirmar transferencia"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
