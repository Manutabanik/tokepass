"use client"

import { Mail, MessageCircle, QrCode, Smartphone } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { deliverPosTickets } from "@/app/actions/pos"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
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
    const text = `Tu entrada Tokepass para ${eventTitle}. Abrí el QR:\n${links}`
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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entrega inmediata</DialogTitle>
          <DialogDescription>
            Mostrá el LivingQR para que el cliente lo escanee, o envialo por
            WhatsApp, SMS o email.
          </DialogDescription>
        </DialogHeader>

        {current ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-background p-3">
              <LivingTicketQR
                ticketId={current.id}
                totpSecret={current.totpSecret}
                size={196}
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
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay entradas emitidas.</p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="grid w-full grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => send("whatsapp")}
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </Button>
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
          <Button type="button" onClick={onClose} className="w-full min-h-12">
            <QrCode className="size-4" />
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
