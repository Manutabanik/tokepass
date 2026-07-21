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
}: {
  ticketId: string
  eventTitle: string
  disabled?: boolean
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
        className="h-11 w-full rounded-full border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
      >
        <Send className="size-4" aria-hidden="true" />
        Enviar / Regalar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Transferir entrada</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Vas a regalar tu acceso a{" "}
              <span className="font-medium text-zinc-200">{eventTitle}</span>.
            </DialogDescription>
          </DialogHeader>

          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm leading-5 text-red-100"
          >
            Al transferir esta entrada, el código QR de tu teléfono quedará{" "}
            <strong className="font-semibold text-red-50">
              ANULADO de forma permanente
            </strong>{" "}
            y se emitirá uno nuevo para el destinatario. Esta acción no se puede
            deshacer.
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`transfer-email-${ticketId}`}
              className="text-zinc-300"
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
              className="border-zinc-800 bg-zinc-900 text-white"
            />
          </div>

          <DialogFooter className="border-zinc-800 bg-zinc-950/80 sm:justify-stretch">
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
