"use client"

import {
  Ban,
  MessageCircle,
  Mail,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Ticket,
  UserRoundPen,
  Users,
} from "lucide-react"
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber } from "@/lib/format"
import {
  formatCheckInLabel,
  matchesIssuedTicketQuery,
  MOCK_ISSUED_TICKET_METRICS,
  MOCK_ISSUED_TICKETS,
  type IssuedTicketRow,
  type IssuedTicketUiStatus,
} from "@/lib/admin/issued-tickets-mock"
import { cn } from "@/lib/utils"

type StatusTab = "all" | IssuedTicketUiStatus

type ModalKind = "resend" | "holder" | "cancel" | "courtesy" | null

const TAB_LABELS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "available", label: "Disponibles" },
  { value: "checked_in", label: "Ingresadas" },
  { value: "cancelled", label: "Anuladas" },
]

function StatusBadge({ ticket }: { ticket: IssuedTicketRow }) {
  if (ticket.status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/35 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-200">
        <span className="size-1.5 rounded-full bg-red-400" aria-hidden />
        Anulado
      </span>
    )
  }
  if (ticket.status === "checked_in") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5 rounded-full border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-sky-400" aria-hidden />
          Ingresó
        </span>
        {ticket.checkedInAt ? (
          <span className="pl-3 text-[10px] font-medium text-sky-200/80">
            {formatCheckInLabel(ticket.checkedInAt)}
          </span>
        ) : null}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
      Válido / Sin ingresar
    </span>
  )
}

function RowActionsMenu({
  ticket,
  onResend,
  onPrint,
  onEditHolder,
  onCancel,
}: {
  ticket: IssuedTicketRow
  onResend: () => void
  onPrint: () => void
  onEditHolder: () => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const items: {
    label: string
    icon: ReactNode
    onClick: () => void
    danger?: boolean
    disabled?: boolean
  }[] = [
    {
      label: "Reenviar entrada",
      icon: <Mail className="size-4" aria-hidden />,
      onClick: onResend,
      disabled: ticket.status === "cancelled",
    },
    {
      label: "Descargar / Imprimir PDF",
      icon: <Printer className="size-4" aria-hidden />,
      onClick: onPrint,
    },
    {
      label: "Cambiar titular / Email",
      icon: <UserRoundPen className="size-4" aria-hidden />,
      onClick: onEditHolder,
      disabled: ticket.status === "cancelled",
    },
    {
      label: "Inhabilitar / Cancelar ticket",
      icon: <Ban className="size-4" aria-hidden />,
      onClick: onCancel,
      danger: true,
      disabled: ticket.status === "cancelled",
    },
  ]

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 text-zinc-400 hover:bg-white/5 hover:text-white"
        aria-label={`Acciones de ${ticket.code}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-30 w-64 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl shadow-black/50"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
                item.danger
                  ? "text-red-300 hover:bg-red-500/10"
                  : "text-zinc-200 hover:bg-white/5",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function IssuedTicketsManager({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const [tickets, setTickets] = useState<IssuedTicketRow[]>(MOCK_ISSUED_TICKETS)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [tab, setTab] = useState<StatusTab>("all")
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)

  const [holderName, setHolderName] = useState("")
  const [holderEmail, setHolderEmail] = useState("")
  const [holderDni, setHolderDni] = useState("")

  const [courtesyName, setCourtesyName] = useState("")
  const [courtesyEmail, setCourtesyEmail] = useState("")
  const [courtesyDni, setCourtesyDni] = useState("")
  const [courtesySector, setCourtesySector] = useState("Campo General")

  const activeTicket =
    tickets.find((ticket) => ticket.id === activeTicketId) ?? null

  const filtered = useMemo(() => {
    return tickets.filter((ticket) => {
      if (tab !== "all" && ticket.status !== tab) return false
      return matchesIssuedTicketQuery(ticket, deferredQuery)
    })
  }, [tickets, tab, deferredQuery])

  const liveMetrics = useMemo(() => {
    const total = tickets.length
    const checkedIn = tickets.filter((t) => t.status === "checked_in").length
    const pending = tickets.filter((t) => t.status === "available").length
    return { total, checkedIn, pending }
  }, [tickets])

  function openModal(kind: ModalKind, ticket?: IssuedTicketRow) {
    if (ticket) {
      setActiveTicketId(ticket.id)
      setHolderName(ticket.holderName)
      setHolderEmail(ticket.holderEmail)
      setHolderDni(ticket.holderDni)
    } else {
      setActiveTicketId(null)
    }
    setModal(kind)
  }

  function closeModal() {
    setModal(null)
    setActiveTicketId(null)
  }

  function handlePrint(ticket: IssuedTicketRow) {
    toast.message("Abriendo ticket para imprimir", {
      description: `#${ticket.code} · ${ticket.holderName}`,
    })
    window.open(`/tickets/${ticket.id}/print`, "_blank", "noopener,noreferrer")
  }

  function confirmResend(channel: "email" | "whatsapp") {
    if (!activeTicket) return
    if (channel === "email") {
      toast.success("Entrada reenviada por email", {
        description: `Enviamos #${activeTicket.code} a ${activeTicket.holderEmail}`,
      })
      closeModal()
      return
    }
    const message = [
      `Hola ${activeTicket.holderName},`,
      `Te reenviamos tu entrada Tokepass para "${eventTitle}".`,
      `Código: #${activeTicket.code}`,
      activeTicket.ticketUrl,
    ].join("\n")
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    )
    toast.success("Listo para WhatsApp", {
      description: "Se abrió el chat con el mensaje precargado.",
    })
    closeModal()
  }

  function confirmHolderUpdate() {
    if (!activeTicketId) return
    const name = holderName.trim()
    const email = holderEmail.trim()
    const dni = holderDni.trim()
    if (name.length < 3 || !email.includes("@") || dni.length < 6) {
      toast.error("Revisá nombre, email y DNI.")
      return
    }
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === activeTicketId
          ? {
              ...ticket,
              holderName: name,
              holderEmail: email,
              holderDni: dni,
            }
          : ticket,
      ),
    )
    toast.success("Titular actualizado", {
      description: `${name} · ${email}`,
    })
    closeModal()
  }

  function confirmCancel() {
    if (!activeTicketId) return
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === activeTicketId
          ? { ...ticket, status: "cancelled", checkedInAt: null }
          : ticket,
      ),
    )
    toast.success("Ticket anulado", {
      description: "El QR ya no será válido en el escáner.",
    })
    closeModal()
  }

  function confirmCourtesy() {
    const name = courtesyName.trim()
    const email = courtesyEmail.trim()
    const dni = courtesyDni.trim()
    if (name.length < 3 || !email.includes("@") || dni.length < 6) {
      toast.error("Completá los datos de la cortesía.")
      return
    }
    const code = `TK-${String(86000 + tickets.length)}`
    const id = `tkt-courtesy-${Date.now()}`
    const next: IssuedTicketRow = {
      id,
      code,
      holderName: name,
      holderEmail: email,
      holderDni: dni,
      sectorLabel: courtesySector.trim() || "Campo General",
      status: "available",
      checkedInAt: null,
      ticketUrl: `https://www.tokepass.com.ar/tickets/${id}`,
    }
    setTickets((current) => [next, ...current])
    setCourtesyName("")
    setCourtesyEmail("")
    setCourtesyDni("")
    setCourtesySector("Campo General")
    toast.success("Cortesía emitida", {
      description: `#${code} lista para reenviar o imprimir.`,
    })
    closeModal()
  }

  const checkedInPct =
    MOCK_ISSUED_TICKET_METRICS.totalIssued > 0
      ? Math.round(
          (MOCK_ISSUED_TICKET_METRICS.checkedIn /
            MOCK_ISSUED_TICKET_METRICS.totalIssued) *
            100,
        )
      : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Entradas emitidas y clientes
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Buscá compradores, reenviá entradas o resolvé reclamos al instante.
          </p>
        </header>
        <Button
          type="button"
          variant="outline"
          onClick={() => openModal("courtesy")}
          className="h-11 shrink-0 rounded-xl border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
        >
          <Plus className="size-4" aria-hidden />
          Emitir entrada manual / Cortesía
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={<Ticket className="size-4 text-emerald-400" />}
          label="Total emitidas"
          value={formatNumber(MOCK_ISSUED_TICKET_METRICS.totalIssued)}
          hint={`Mock visible: ${formatNumber(liveMetrics.total)} filas`}
        />
        <MetricCard
          icon={<Users className="size-4 text-sky-400" />}
          label="Ya ingresaron"
          value={formatNumber(MOCK_ISSUED_TICKET_METRICS.checkedIn)}
          hint={`${checkedInPct}% del total`}
        />
        <MetricCard
          icon={<Search className="size-4 text-amber-300" />}
          label="Pendientes de ingreso"
          value={formatNumber(MOCK_ISSUED_TICKET_METRICS.pending)}
          hint={`En lista: ${formatNumber(liveMetrics.pending)} disponibles`}
        />
      </section>

      <section className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscá por nombre, apellido, DNI, email o código…"
            className="h-14 rounded-2xl border-zinc-800 bg-black pl-12 text-base text-white placeholder:text-zinc-600"
            aria-label="Buscar entradas emitidas"
          />
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as StatusTab)}
          className="gap-4"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-1.5 group-data-horizontal/tabs:h-auto">
            {TAB_LABELS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="rounded-xl px-3 py-2 text-xs data-active:bg-zinc-800 data-active:text-white sm:text-sm"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="px-4 text-zinc-500">Comprador</TableHead>
                <TableHead className="hidden px-4 text-zinc-500 md:table-cell">
                  Ubicación / Entrada
                </TableHead>
                <TableHead className="px-4 text-zinc-500">Código</TableHead>
                <TableHead className="px-4 text-zinc-500">Estado</TableHead>
                <TableHead className="px-4 text-right text-zinc-500">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-zinc-500"
                  >
                    No hay entradas que coincidan con la búsqueda o el filtro.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="border-zinc-800 hover:bg-white/[0.03]"
                  >
                    <TableCell className="px-4 py-3 align-top">
                      <p className="font-semibold text-white">
                        {ticket.holderName}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {ticket.holderEmail}
                      </p>
                      <p className="text-xs text-zinc-500">
                        DNI {ticket.holderDni}
                      </p>
                      <p className="mt-2 text-xs text-zinc-400 md:hidden">
                        {ticket.sectorLabel}
                      </p>
                    </TableCell>
                    <TableCell className="hidden max-w-[240px] truncate px-4 py-3 text-sm text-zinc-300 md:table-cell">
                      {ticket.sectorLabel}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm text-zinc-200">
                      #{ticket.code}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge ticket={ticket} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <RowActionsMenu
                        ticket={ticket}
                        onResend={() => openModal("resend", ticket)}
                        onPrint={() => handlePrint(ticket)}
                        onEditHolder={() => openModal("holder", ticket)}
                        onCancel={() => openModal("cancel", ticket)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-zinc-600">
          Vista con datos mock para el evento{" "}
          <span className="font-mono text-zinc-500">{eventId.slice(0, 8)}</span>.
          Mostrando {formatNumber(filtered.length)} de{" "}
          {formatNumber(tickets.length)} filas cargadas.
        </p>
      </section>

      <Dialog
        open={modal === "resend"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reenviar entrada</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {activeTicket
                ? `#${activeTicket.code} · ${activeTicket.holderName}`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              className="h-11 justify-start rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={() => confirmResend("email")}
            >
              <Mail className="size-4" />
              Reenviar por email
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start rounded-xl border-zinc-700 bg-zinc-900 text-zinc-100"
              onClick={() => confirmResend("whatsapp")}
            >
              <MessageCircle className="size-4" />
              Abrir enlace de WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "holder"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar titular / Email</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Corregí los datos si el comprador se equivocó en el checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="holder-name">Nombre y apellido</Label>
              <Input
                id="holder-name"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holder-email">Email</Label>
              <Input
                id="holder-email"
                type="email"
                value={holderEmail}
                onChange={(e) => setHolderEmail(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holder-dni">DNI</Label>
              <Input
                id="holder-dni"
                value={holderDni}
                onChange={(e) => setHolderDni(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="text-zinc-400"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmHolderUpdate}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "cancel"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inhabilitar ticket</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {activeTicket
                ? `Vas a anular #${activeTicket.code} de ${activeTicket.holderName}. El QR dejará de pasar en puerta.`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="text-zinc-400"
            >
              Volver
            </Button>
            <Button
              type="button"
              onClick={confirmCancel}
              className="rounded-xl bg-red-600 text-white hover:bg-red-500"
            >
              <Ban className="size-4" />
              Anular ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "courtesy"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Emitir entrada manual / Cortesía</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Ideal para pago en efectivo en oficina o invitados especiales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-name">Nombre y apellido</Label>
              <Input
                id="courtesy-name"
                value={courtesyName}
                onChange={(e) => setCourtesyName(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-email">Email</Label>
              <Input
                id="courtesy-email"
                type="email"
                value={courtesyEmail}
                onChange={(e) => setCourtesyEmail(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-dni">DNI</Label>
              <Input
                id="courtesy-dni"
                value={courtesyDni}
                onChange={(e) => setCourtesyDni(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-sector">Sector / ubicación</Label>
              <Input
                id="courtesy-sector"
                value={courtesySector}
                onChange={(e) => setCourtesySector(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="text-zinc-400"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmCourtesy}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Plus className="size-4" />
              Emitir cortesía
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  )
}
