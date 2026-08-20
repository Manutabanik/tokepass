"use client"

import { LoaderCircle, Send, Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  cancelTicketTransferAction,
  transferTicketAction,
} from "@/app/actions/transfer"
import { TicketActionLegalClickwrap } from "@/components/public/ticket-action-legal-clickwrap"
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

export function TransferTicketDialog({
  ticketId,
  eventTitle,
  disabled = false,
  triggerLabel = "Transferir a un amigo",
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
  const [accepted, setAccepted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleTransfer() {
    if (isPending || !accepted) return

    startTransition(async () => {
      try {
        const result = await transferTicketAction({
          ticketId,
          receiverEmail: email,
          termsAccepted: accepted,
        })

        if (!result.success) {
          toast.error(result.error)
          return
        }

        toast.success("Transferencia iniciada", {
          description: `Pendiente de reclamo por ${result.receiverEmail}. El Living QR quedó oculto.`,
        })
        setOpen(false)
        setEmail("")
        setAccepted(false)
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
        variant={triggerClassName ? "default" : "outline"}
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setAccepted(false)
        }}
      >
        <DialogContent className="border-border bg-card/90 shadow-2xl shadow-black/20 backdrop-blur-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transferir a un amigo</DialogTitle>
            <DialogDescription>
              Vas a ceder la titularidad de tu acceso a{" "}
              <span className="font-medium text-foreground">{eventTitle}</span>.
              Solo necesitamos el email de la cuenta TokePass destinataria.
            </DialogDescription>
          </DialogHeader>

          <div
            role="status"
            className="rounded-2xl border border-border bg-muted/50 px-3.5 py-3 text-sm leading-5 text-muted-foreground"
          >
            El Living QR se oculta en tu teléfono hasta que tu amigo reclame la
            entrada. Podés cancelar mientras el estado sea pendiente.
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

          <TicketActionLegalClickwrap
            checked={accepted}
            onCheckedChange={setAccepted}
            disabled={isPending}
            actionLabel="cedés la titularidad al email indicado"
          />

          <DialogFooter className="sm:justify-stretch">
            <Button
              type="button"
              disabled={isPending || !email.trim() || !accepted}
              onClick={handleTransfer}
              className="h-11 w-full rounded-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              {isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Enviando…
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

export function CancelTicketTransferButton({
  transferId,
  receiverEmail,
  className,
}: {
  transferId: string
  receiverEmail?: string
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    if (isPending) return

    startTransition(async () => {
      const result = await cancelTicketTransferAction(transferId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Transferencia cancelada", {
        description: "El Living QR volvió a tu entrada.",
      })
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={handleCancel}
      className={
        className ??
        "h-11 w-full rounded-full border-border bg-background text-sm font-semibold text-foreground hover:bg-muted"
      }
    >
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Undo2 className="size-4" aria-hidden="true" />
      )}
      {isPending ? "Cancelando…" : "Cancelar transferencia"}
      {receiverEmail ? (
        <span className="sr-only"> enviada a {receiverEmail}</span>
      ) : null}
    </Button>
  )
}
