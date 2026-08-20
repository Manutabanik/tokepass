"use client"

import { Mail, MessageCircle, Printer, Smartphone, X } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { deliverPosTickets } from "@/app/actions/pos"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { printTicketsViaHiddenIframe } from "@/lib/pos-thermal-print"

export type PosHandoffTicket = {
  id: string
  totpSecret: string
}

function digitsPhone(value: string): string {
  return value.replace(/\D/g, "")
}

export function PosTicketHandoffDialog({
  open,
  eventTitle,
  tickets,
  initialPhone,
  onClose,
}: {
  open: boolean
  eventTitle: string
  tickets: PosHandoffTicket[]
  initialPhone?: string
  onClose: () => void
}) {
  const [phone, setPhone] = useState(initialPhone ?? "")
  const [email, setEmail] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const current = tickets[activeIndex] ?? tickets[0]
  const siteOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://tokepass.app"

  const whatsappHref = useMemo(() => {
    const digits = digitsPhone(phone)
    if (!digits || tickets.length === 0) return null
    const links = tickets
      .map((ticket) => `${siteOrigin}/tickets/${ticket.id}/print`)
      .join("\n")
    const text = `Tu entrada TokePass para ${eventTitle}. Abrí el QR:\n${links}`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
  }, [eventTitle, phone, siteOrigin, tickets])

  function send(channel: "whatsapp" | "sms" | "email") {
    startTransition(async () => {
      if (channel === "whatsapp") {
        const result = await deliverPosTickets({
          eventTitle,
          ticketIds: tickets.map((ticket) => ticket.id),
          phone,
        })
        if (!result.success) {
          toast.error(result.error)
          return
        }
        if (whatsappHref) window.open(whatsappHref, "_blank", "noopener,noreferrer")
        toast.success("Enlace de WhatsApp listo")
        return
      }
      if (channel === "sms") {
        const result = await deliverPosTickets({
          eventTitle,
          ticketIds: tickets.map((ticket) => ticket.id),
          phone,
        })
        if (!result.success) {
          toast.error(result.error)
          return
        }
        toast.success("SMS / webhook enviado")
        return
      }
      const result = await deliverPosTickets({
        eventTitle,
        ticketIds: tickets.map((ticket) => ticket.id),
        email,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Entrada enviada por email")
    })
  }

  function printTicket() {
    startTransition(async () => {
      await printTicketsViaHiddenIframe(tickets.map((ticket) => ticket.id))
      toast.success("Ticket enviado a impresion")
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-md"
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-zinc-200 bg-white p-4 pr-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <DialogTitle>Comprobante de Venta</DialogTitle>
            <DialogDescription className="mt-1">
              Mostrá el Living QR o enviá la entrada al cliente.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Cerrar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </DialogHeader>

        <DialogBody className="space-y-4 p-6">
          {current ? (
            <>
              <div className="mx-auto w-full max-w-[12.5rem] rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800">
                <LivingTicketQR
                  ticketId={current.id}
                  totpSecret={current.totpSecret}
                  size={168}
                  variant="scan"
                />
              </div>
              {tickets.length > 1 ? (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activeIndex <= 0}
                    onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {activeIndex + 1} / {tickets.length}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activeIndex >= tickets.length - 1}
                    onClick={() =>
                      setActiveIndex((value) =>
                        Math.min(tickets.length - 1, value + 1),
                      )
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {eventTitle} · {tickets.length}{" "}
                {tickets.length === 1 ? "entrada" : "entradas"}
              </p>
              <div className="space-y-2">
                <Label htmlFor="handoff-phone">WhatsApp / SMS</Label>
                <Input
                  id="handoff-phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="54911..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="handoff-email">Email</Label>
                <Input
                  id="handoff-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="cliente@correo.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => send("sms")}
                >
                  <Smartphone className="size-4" />
                  SMS
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => send("email")}
                >
                  <Mail className="size-4" />
                  Email
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No hay entradas emitidas.</p>
          )}
        </DialogBody>

        <DialogFooter className="mx-0 mb-0 flex-col gap-2 rounded-b-2xl border-t border-zinc-200 bg-zinc-50 p-4 sm:flex-col dark:border-zinc-800 dark:bg-zinc-900/80">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => send("whatsapp")}
            className="min-h-11 w-full"
          >
            <MessageCircle className="size-4" />
            Enviar por WhatsApp
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || tickets.length === 0}
            onClick={printTicket}
            className="min-h-11 w-full"
          >
            <Printer className="size-4" />
            Imprimir Ticket
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full"
          >
            Nueva Venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
