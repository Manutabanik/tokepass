"use client"

import { Printer, X } from "lucide-react"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { deliverPosTickets } from "@/app/actions/pos"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { printAdmissionTicketPdfs } from "@/lib/pos-thermal-print"

export type PosHandoffTicket = {
  id: string
  totpSecret: string
}

function digitsPhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 13)
}

function formatWhatsappInput(value: string): string {
  const digits = digitsPhone(value)
  if (digits.startsWith("54") && digits.length > 2) {
    const rest = digits.slice(2)
    const country = "+54"
    if (rest.length <= 1) return `${country} ${rest}`
    if (rest.length <= 3) return `${country} ${rest.slice(0, 1)} ${rest.slice(1)}`
    if (rest.length <= 7) {
      return `${country} ${rest.slice(0, 1)} ${rest.slice(1, 3)} ${rest.slice(3)}`
    }
    return `${country} ${rest.slice(0, 1)} ${rest.slice(1, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`
  }
  return digits
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return target.isContentEditable
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
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp")
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const current = tickets[activeIndex] ?? tickets[0]
  const siteOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://tokepass.app"
  const ticketCount = tickets.length

  const whatsappHref = useMemo(() => {
    const digits = digitsPhone(phone)
    if (!digits || tickets.length === 0) return null
    const links = tickets
      .map((ticket) => `${siteOrigin}/tickets/${ticket.id}/print`)
      .join("\n")
    const text = `Tu entrada TokePass para ${eventTitle}. Abri el QR:\n${links}`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
  }, [eventTitle, phone, siteOrigin, tickets])

  useEffect(() => {
    if (!open) return
    setPhone(formatWhatsappInput(initialPhone ?? ""))
    setEmail("")
    setChannel("whatsapp")
    setActiveIndex(0)
  }, [open, initialPhone])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== "NumpadEnter") return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  function sendWhatsapp() {
    startTransition(async () => {
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
    })
  }

  function sendEmail() {
    startTransition(async () => {
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
      try {
        await printAdmissionTicketPdfs(tickets.map((ticket) => ticket.id))
        toast.success("Ticket enviado a impresion")
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo imprimir el ticket PDF",
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-card p-5"
      >
        <DialogHeader className="space-y-1 p-0 text-center">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold">
                Comprobante de Venta
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {eventTitle} · {ticketCount}{" "}
                {ticketCount === 1 ? "entrada" : "entradas"}
              </DialogDescription>
            </div>
            <DialogClose
              aria-label="Cerrar"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </DialogClose>
          </div>
        </DialogHeader>

        {current ? (
          <div className="mt-3 flex flex-col items-center justify-center">
            <LivingTicketQR
              ticketId={current.id}
              totpSecret={current.totpSecret}
              size={144}
              variant="scan"
              compact
              className="w-40"
            />
            {tickets.length > 1 ? (
              <div className="mt-2 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={activeIndex <= 0}
                  onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
                >
                  Anterior
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {activeIndex + 1} / {tickets.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
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
          </div>
        ) : (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            No hay entradas emitidas.
          </p>
        )}

        <Tabs
          className="mt-3 w-full gap-2"
          value={channel}
          onValueChange={(value) => {
            if (value === "email" || value === "whatsapp") setChannel(value)
          }}
        >
          <TabsList className="mb-2 grid h-9 w-full grid-cols-2">
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
          <TabsContent value="whatsapp" className="mt-0 space-y-2">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendWhatsapp()
              }}
            >
              <Input
                id="handoff-phone"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(formatWhatsappInput(event.target.value))
                }
                placeholder="Ej: 54911..."
                className="h-10 flex-1 text-sm"
              />
              <Button
                type="submit"
                disabled={isPending}
                className="h-10 shrink-0 px-4 text-xs font-semibold"
              >
                Enviar
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="email" className="mt-0 space-y-2">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendEmail()
              }}
            >
              <Input
                id="handoff-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="cliente@correo.com"
                className="h-10 flex-1 text-sm"
              />
              <Button
                type="submit"
                disabled={isPending}
                className="h-10 shrink-0 px-4 text-xs font-semibold"
              >
                Enviar
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending || tickets.length === 0}
            onClick={printTicket}
            className="h-10 w-full text-xs font-semibold"
          >
            <Printer className="size-3.5" />
            Imprimir Ticket
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="h-10 w-full bg-emerald-500 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Nueva Venta (Enter)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
