"use client"

import {
  ArrowRightLeft,
  Ban,
  History,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
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
import {
  custodyChannelLabel,
  formatCheckInLabel,
  matchesIssuedTicketQuery,
  MOCK_ISSUED_TICKET_METRICS,
  MOCK_ISSUED_TICKETS,
  nextMockTicketCode,
  type CustodyTransferEvent,
  type IssuedTicketRow,
  type IssuedTicketUiStatus,
} from "@/lib/admin/issued-tickets-mock"
import { formatDateTime, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

type StatusTab = "all" | IssuedTicketUiStatus

type ModalKind =
  | "resend"
  | "holder"
  | "cancel"
  | "courtesy"
  | "transfer"
  | "custody"
  | null

const TAB_LABELS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "available", label: "Disponibles" },
  { value: "checked_in", label: "Ingresadas" },
  { value: "transferred", label: "Transferidos / Reasignados" },
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
  if (ticket.status === "transferred") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
        <RefreshCw className="size-3" aria-hidden />
        Transferido / Reasignado
      </span>
    )
  }
  if (ticket.status === "checked_in") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5 rounded-full border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-sky-400" aria-hidden />
          Ingresado
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
      Válido
    </span>
  )
}

function TransferLinkChip({
  ticket,
  onOpenCustody,
}: {
  ticket: IssuedTicketRow
  onOpenCustody: () => void
}) {
  if (ticket.status === "transferred" && ticket.transferredTo) {
    return (
      <button
        type="button"
        onClick={onOpenCustody}
        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-left text-[11px] font-medium text-amber-100 transition hover:bg-amber-500/20"
      >
        <RefreshCw className="size-3 shrink-0" aria-hidden />
        <span className="truncate">
          Transferido a {ticket.transferredTo.name} (#{ticket.transferredTo.code}
          )
        </span>
        <History className="size-3 shrink-0 opacity-70" aria-hidden />
      </button>
    )
  }
  if (ticket.receivedFrom) {
    return (
      <button
        type="button"
        onClick={onOpenCustody}
        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-left text-[11px] font-medium text-violet-100 transition hover:bg-violet-500/20"
      >
        <ArrowRightLeft className="size-3 shrink-0" aria-hidden />
        <span className="truncate">
          Recibido de {ticket.receivedFrom.name} (#{ticket.receivedFrom.code})
        </span>
        <History className="size-3 shrink-0 opacity-70" aria-hidden />
      </button>
    )
  }
  if (ticket.custodyChain.length > 0) {
    return (
      <button
        type="button"
        onClick={onOpenCustody}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
      >
        <History className="size-3" aria-hidden />
        Ver cadena de custodia
      </button>
    )
  }
  return null
}

function RowActionsMenu({
  ticket,
  onResend,
  onPrint,
  onEditHolder,
  onTransfer,
  onCancel,
}: {
  ticket: IssuedTicketRow
  onResend: () => void
  onPrint: () => void
  onEditHolder: () => void
  onTransfer: () => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const locked =
    ticket.status === "cancelled" || ticket.status === "transferred"

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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
      disabled: locked || ticket.status === "checked_in",
    },
    {
      label: "Descargar / Imprimir PDF",
      icon: <Printer className="size-4" aria-hidden />,
      onClick: onPrint,
      disabled: ticket.status === "transferred",
    },
    {
      label: "Cambiar titular / Email",
      icon: <UserRoundPen className="size-4" aria-hidden />,
      onClick: onEditHolder,
      disabled: locked,
    },
    {
      label: "Transferir / Reasignar a otra persona",
      icon: <RefreshCw className="size-4" aria-hidden />,
      onClick: onTransfer,
      disabled: locked || ticket.status === "checked_in",
    },
    {
      label: "Inhabilitar / Cancelar ticket",
      icon: <Ban className="size-4" aria-hidden />,
      onClick: onCancel,
      danger: true,
      disabled: locked,
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
          className="absolute right-0 top-10 z-30 w-72 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl shadow-black/50"
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

function CustodyTimeline({
  ticket,
  events,
}: {
  ticket: IssuedTicketRow
  events: CustodyTransferEvent[]
}) {
  const original = ticket.originalBuyer
  const current =
    ticket.status === "transferred" && ticket.transferredTo
      ? {
          name: ticket.transferredTo.name,
          email:
            events.at(-1)?.to.email ??
            "Titular actual (ver ticket destino)",
          dni: events.at(-1)?.to.dni ?? "—",
          code: ticket.transferredTo.code,
        }
      : {
          name: ticket.holderName,
          email: ticket.holderEmail,
          dni: ticket.holderDni,
          code: ticket.code,
        }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Comprador original
        </p>
        <p className="mt-2 font-semibold text-white">{original.name}</p>
        <p className="text-xs text-zinc-400">
          {original.email} · DNI {original.dni}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Compra: {formatDateTime(ticket.purchasedAt)}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Esta entrada no tiene transferencias registradas.
        </p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              key={`${event.fromTicketId}-${event.toTicketId}-${event.at}`}
              className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4"
            >
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                <RefreshCw className="size-3" aria-hidden />
                Acción
              </p>
              <p className="mt-2 text-sm text-amber-50">
                {custodyChannelLabel(event.channel)} el{" "}
                {formatDateTime(event.at)}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                De {event.from.name} (#{event.fromTicketCode}) → {event.to.name}{" "}
                (#{event.toTicketCode})
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">
          Titular actual
        </p>
        <p className="mt-2 font-semibold text-white">{current.name}</p>
        <p className="text-xs text-zinc-400">
          {current.email} · DNI {current.dni}
        </p>
        <p className="mt-1 font-mono text-xs text-emerald-200/90">
          QR vigente: #{current.code}
        </p>
      </div>
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

  const [transferName, setTransferName] = useState("")
  const [transferEmail, setTransferEmail] = useState("")
  const [transferDni, setTransferDni] = useState("")

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
    const transferred = tickets.filter((t) => t.status === "transferred").length
    return { total, checkedIn, pending, transferred }
  }, [tickets])

  function openModal(kind: ModalKind, ticket?: IssuedTicketRow) {
    if (ticket) {
      setActiveTicketId(ticket.id)
      setHolderName(ticket.holderName)
      setHolderEmail(ticket.holderEmail)
      setHolderDni(ticket.holderDni)
      setTransferName("")
      setTransferEmail("")
      setTransferDni("")
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
    if (ticket.status === "transferred") {
      toast.error("Este QR ya no es válido", {
        description: "Abrí el ticket del titular actual desde la cadena.",
      })
      return
    }
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
          ? {
              ...ticket,
              status: "cancelled",
              checkedInAt: null,
              transferredTo: null,
            }
          : ticket,
      ),
    )
    toast.success("Ticket anulado", {
      description: "El QR ya no será válido en el escáner.",
    })
    closeModal()
  }

  function confirmTransfer() {
    if (!activeTicket || !activeTicketId) return
    const name = transferName.trim()
    const email = transferEmail.trim().toLowerCase()
    const dni = transferDni.trim()
    if (name.length < 3 || !email.includes("@") || dni.length < 6) {
      toast.error("Completá nombre, email y DNI del nuevo titular.")
      return
    }
    if (email === activeTicket.holderEmail.toLowerCase()) {
      toast.error("El nuevo titular debe ser otra persona.")
      return
    }

    const newCode = nextMockTicketCode(tickets)
    const newId = `tkt-transfer-${Date.now()}`
    const now = new Date().toISOString()
    const fromParty = {
      name: activeTicket.holderName,
      email: activeTicket.holderEmail,
      dni: activeTicket.holderDni,
    }
    const toParty = { name, email, dni }
    const event: CustodyTransferEvent = {
      at: now,
      channel: "admin_reassign",
      from: fromParty,
      to: toParty,
      fromTicketCode: activeTicket.code,
      toTicketCode: newCode,
      fromTicketId: activeTicket.id,
      toTicketId: newId,
    }
    const chain = [...activeTicket.custodyChain, event]

    const newTicket: IssuedTicketRow = {
      id: newId,
      code: newCode,
      holderName: name,
      holderEmail: email,
      holderDni: dni,
      sectorLabel: activeTicket.sectorLabel,
      status: "available",
      checkedInAt: null,
      purchasedAt: activeTicket.purchasedAt,
      ticketUrl: `https://www.tokepass.com.ar/tickets/${newId}`,
      originalBuyer: activeTicket.originalBuyer,
      transferredTo: null,
      receivedFrom: {
        name: activeTicket.holderName,
        code: activeTicket.code,
        ticketId: activeTicket.id,
      },
      custodyChain: chain,
    }

    setTickets((current) => [
      newTicket,
      ...current.map((ticket) =>
        ticket.id === activeTicketId
          ? {
              ...ticket,
              status: "transferred" as const,
              checkedInAt: null,
              transferredTo: {
                name,
                code: newCode,
                ticketId: newId,
              },
              custodyChain: chain,
            }
          : ticket,
      ),
    ])

    toast.success("Transferencia completada", {
      description: `QR #${activeTicket.code} invalidado. Nuevo #${newCode} enviado a ${email}.`,
    })
    setTransferName("")
    setTransferEmail("")
    setTransferDni("")
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
    const code = nextMockTicketCode(tickets)
    const id = `tkt-courtesy-${Date.now()}`
    const buyer = { name, email, dni }
    const next: IssuedTicketRow = {
      id,
      code,
      holderName: name,
      holderEmail: email,
      holderDni: dni,
      sectorLabel: courtesySector.trim() || "Campo General",
      status: "available",
      checkedInAt: null,
      purchasedAt: new Date().toISOString(),
      ticketUrl: `https://www.tokepass.com.ar/tickets/${id}`,
      originalBuyer: buyer,
      transferredTo: null,
      receivedFrom: null,
      custodyChain: [],
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
            Buscá compradores, reenviá entradas, transferí titulares o resolvé
            reclamos con trazabilidad completa.
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          hint={`En lista: ${formatNumber(liveMetrics.pending)} válidos`}
        />
        <MetricCard
          icon={<RefreshCw className="size-4 text-orange-300" />}
          label="Transferidos"
          value={formatNumber(liveMetrics.transferred)}
          hint="QR originales invalidados"
        />
      </section>

      <section className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscá por nombre, DNI, email, código o historial de transferencia…"
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
                      <TransferLinkChip
                        ticket={ticket}
                        onOpenCustody={() => openModal("custody", ticket)}
                      />
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
                        onTransfer={() => openModal("transfer", ticket)}
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
              Corrección de datos del mismo titular. Para ceder la entrada usá
              Transferir / Reasignar.
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
        open={modal === "transfer"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir / Reasignar</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {activeTicket
                ? `Se invalida #${activeTicket.code} y se emite un QR nuevo al destinatario.`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
              El QR actual dejará de pasar en puerta. Queda registro en la
              cadena de custodia.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-name">Nombre y apellido</Label>
              <Input
                id="transfer-name"
                value={transferName}
                onChange={(e) => setTransferName(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-email">Email del nuevo titular</Label>
              <Input
                id="transfer-email"
                type="email"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-dni">DNI</Label>
              <Input
                id="transfer-dni"
                value={transferDni}
                onChange={(e) => setTransferDni(e.target.value)}
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
              onClick={confirmTransfer}
              className="rounded-xl bg-amber-500 text-zinc-950 hover:bg-amber-400"
            >
              <RefreshCw className="size-4" />
              Confirmar transferencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "custody"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadena de custodia</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {activeTicket
                ? `Historial de #${activeTicket.code} · ${activeTicket.sectorLabel}`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          {activeTicket ? (
            <CustodyTimeline
              ticket={activeTicket}
              events={activeTicket.custodyChain}
            />
          ) : null}
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
