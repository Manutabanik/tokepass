"use client"

import {
  ArrowRightLeft,
  Ban,
  Download,
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
  useTransition,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  cancelTicketAdmin,
  exportEventTicketsCSV,
  getIssuedTicketsForEvent,
  reassignTicketAdmin,
  resendTicketEmailAdmin,
  updateTicketHolderAdmin,
} from "@/app/actions/issued-tickets"
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
  type CustodyTransferEvent,
  type IssuedTicketMetrics,
  type IssuedTicketRow,
  type IssuedTicketUiStatus,
} from "@/lib/admin/issued-tickets"
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

function TestBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-200">
      TEST
    </span>
  )
}

function StatusBadge({ ticket }: { ticket: IssuedTicketRow }) {
  const statusNode =
    ticket.status === "cancelled" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/35 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-200">
        <span className="size-1.5 rounded-full bg-red-400" aria-hidden />
        Anulado
      </span>
    ) : ticket.status === "transferred" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-200">
        <RefreshCw className="size-3" aria-hidden />
        Transferido / Reasignado
      </span>
    ) : ticket.status === "checked_in" ? (
      <span className="inline-flex flex-col items-start gap-0.5 rounded-full border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-200">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-sky-400" aria-hidden />
          Ingresado
        </span>
        {ticket.checkedInAt ? (
          <span className="pl-3 text-[10px] font-medium text-sky-600 dark:text-sky-200">
            {formatCheckInLabel(ticket.checkedInAt)}
          </span>
        ) : null}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-200">
        <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
        Válido
      </span>
    )

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {ticket.isTest ? <TestBadge /> : null}
      {statusNode}
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
        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-left text-[11px] font-medium text-amber-600 dark:text-amber-200 transition hover:bg-amber-500/20"
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
        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-left text-[11px] font-medium text-violet-600 dark:text-violet-200 transition hover:bg-violet-500/20"
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
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted"
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
        className="size-9 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        aria-label={`Acciones de ${ticket.code}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-30 w-72 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-2xl shadow-black/50"
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
                  ? "text-rose-600 hover:bg-red-500/10 dark:text-rose-300"
                  : "text-foreground hover:bg-muted/50",
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
      <div className="rounded-2xl border border-border bg-muted p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Comprador original
        </p>
        <p className="mt-2 font-semibold text-foreground">{original.name}</p>
        <p className="text-xs text-muted-foreground">
          {original.email} · DNI {original.dni}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Compra: {formatDateTime(ticket.purchasedAt)}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta entrada no tiene transferencias registradas.
        </p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              key={`${event.fromTicketId}-${event.toTicketId}-${event.at}`}
              className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4"
            >
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-200">
                <RefreshCw className="size-3" aria-hidden />
                Acción
              </p>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-100">
                {custodyChannelLabel(event.channel)} el{" "}
                {formatDateTime(event.at)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                De {event.from.name} (#{event.fromTicketCode}) → {event.to.name}{" "}
                (#{event.toTicketCode})
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-200">
          Titular actual
        </p>
        <p className="mt-2 font-semibold text-foreground">{current.name}</p>
        <p className="text-xs text-muted-foreground">
          {current.email} · DNI {current.dni}
        </p>
        <p className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-200">
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
  const [tickets, setTickets] = useState<IssuedTicketRow[]>([])
  const [metrics, setMetrics] = useState<IssuedTicketMetrics>({
    totalIssued: 0,
    checkedIn: 0,
    pending: 0,
    transferred: 0,
  })
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState(false)
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

  const [cancelReason, setCancelReason] = useState("")

  const [courtesyName, setCourtesyName] = useState("")
  const [courtesyEmail, setCourtesyEmail] = useState("")
  const [courtesyDni, setCourtesyDni] = useState("")
  const [courtesySector, setCourtesySector] = useState("Campo General")
  const [exportPending, startExport] = useTransition()

  const activeTicket =
    tickets.find((ticket) => ticket.id === activeTicketId) ?? null

  function downloadAudienceCsv() {
    startExport(async () => {
      const result = await exportEventTicketsCSV(eventId)
      if (!result.success) {
        toast.error("No se pudo exportar la audiencia", {
          description: result.error,
        })
        return
      }

      const blob = new Blob([result.data.csv], {
        type: "text/csv;charset=utf-8;",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = result.data.filename
      anchor.rel = "noopener"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      toast.success("Audiencia exportada", {
        description: `${result.data.rowCount} fila${result.data.rowCount === 1 ? "" : "s"} · ${result.data.filename}`,
      })
    })
  }

  async function refreshTickets(opts?: {
    search?: string
    status?: StatusTab
    silent?: boolean
  }) {
    if (!opts?.silent) setLoading(true)
    const statusFilter =
      opts?.status && opts.status !== "all" ? opts.status : undefined
    const result = await getIssuedTicketsForEvent(
      eventId,
      opts?.search,
      statusFilter,
    )
    if (!result.success) {
      toast.error("No se pudieron cargar las entradas", {
        description: result.error,
      })
      if (!opts?.silent) setLoading(false)
      return
    }
    setTickets(result.data.tickets)
    setMetrics(result.data.metrics)
    if (!opts?.silent) setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const statusFilter = tab !== "all" ? tab : undefined
      const result = await getIssuedTicketsForEvent(
        eventId,
        deferredQuery,
        statusFilter,
      )
      if (cancelled) return
      if (!result.success) {
        toast.error("No se pudieron cargar las entradas", {
          description: result.error,
        })
        setTickets([])
        setLoading(false)
        return
      }
      setTickets(result.data.tickets)
      setMetrics(result.data.metrics)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [eventId, deferredQuery, tab])

  const filtered = useMemo(() => {
    // El servidor ya filtra; mantenemos un pass local por si el deferral
    // aún no disparó el fetch.
    return tickets.filter((ticket) => {
      if (tab !== "all" && ticket.status !== tab) return false
      return matchesIssuedTicketQuery(ticket, deferredQuery)
    })
  }, [tickets, tab, deferredQuery])

  const checkedInPct =
    metrics.totalIssued > 0
      ? Math.round((metrics.checkedIn / metrics.totalIssued) * 100)
      : 0

  function openModal(kind: ModalKind, ticket?: IssuedTicketRow) {
    if (ticket) {
      setActiveTicketId(ticket.id)
      setHolderName(ticket.holderName)
      setHolderEmail(ticket.holderEmail)
      setHolderDni(ticket.holderDni)
      setTransferName("")
      setTransferEmail("")
      setTransferDni("")
      setCancelReason("")
    } else {
      setActiveTicketId(null)
    }
    setModal(kind)
  }

  function closeModal() {
    if (actionPending) return
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

  async function confirmResend(channel: "email" | "whatsapp") {
    if (!activeTicket) return
    if (channel === "whatsapp") {
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
      return
    }

    setActionPending(true)
    const result = await resendTicketEmailAdmin(activeTicket.id)
    setActionPending(false)
    if (!result.success) {
      toast.error("No se pudo reenviar", { description: result.error })
      return
    }
    toast.success("Entrada reenviada por email", {
      description: `Enviamos #${activeTicket.code} a ${result.data.email}`,
    })
    closeModal()
  }

  async function confirmHolderUpdate() {
    if (!activeTicketId) return
    const name = holderName.trim()
    const email = holderEmail.trim()
    const dni = holderDni.trim()
    if (name.length < 3 || !email.includes("@") || dni.length < 6) {
      toast.error("Revisá nombre, email y DNI.")
      return
    }
    setActionPending(true)
    const result = await updateTicketHolderAdmin(activeTicketId, {
      name,
      email,
      dni,
    })
    setActionPending(false)
    if (!result.success) {
      toast.error("No se pudo actualizar", { description: result.error })
      return
    }
    toast.success("Titular actualizado", {
      description: `${name} · ${email}`,
    })
    closeModal()
    await refreshTickets({
      search: deferredQuery,
      status: tab,
      silent: true,
    })
  }

  async function confirmCancel() {
    if (!activeTicketId) return
    const reason = cancelReason.trim() || "Anulado por el organizador"
    setActionPending(true)
    const result = await cancelTicketAdmin(activeTicketId, reason)
    setActionPending(false)
    if (!result.success) {
      toast.error("No se pudo anular", { description: result.error })
      return
    }
    toast.success("Ticket anulado", {
      description: "El QR ya no será válido en el escáner.",
    })
    closeModal()
    await refreshTickets({
      search: deferredQuery,
      status: tab,
      silent: true,
    })
  }

  async function confirmTransfer() {
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

    setActionPending(true)
    const result = await reassignTicketAdmin(activeTicketId, {
      name,
      email,
      dni,
    })
    setActionPending(false)
    if (!result.success) {
      toast.error("No se pudo reasignar", { description: result.error })
      return
    }

    toast.success("Transferencia completada", {
      description: `QR #${activeTicket.code} invalidado. Nuevo #${result.data.code} enviado a ${email}.`,
    })
    setTransferName("")
    setTransferEmail("")
    setTransferDni("")
    closeModal()
    await refreshTickets({
      search: deferredQuery,
      status: tab,
      silent: true,
    })
  }

  function confirmCourtesy() {
    toast.message("Cortesías desde Listas", {
      description:
        "Emití FreePass / cortesías desde Listas de invitados del evento.",
    })
    setCourtesyName("")
    setCourtesyEmail("")
    setCourtesyDni("")
    setCourtesySector("Campo General")
    closeModal()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Lista de Compradores
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Buscá compradores, reenviá entradas, cambiá el titular o resolvé
            reclamos. Descargá la lista cuando la necesites.
          </p>
        </header>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={exportPending || loading}
            onClick={downloadAudienceCsv}
            className="h-11 rounded-xl border-border bg-card text-foreground hover:bg-muted"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {exportPending ? "Exportando…" : "Descargar lista (CSV)"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => openModal("courtesy")}
            className="h-11 rounded-xl border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="size-4" aria-hidden />
            Emitir entrada manual / Cortesía
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Ticket className="size-4 text-emerald-600 dark:text-emerald-200" />}
          label="Total emitidas"
          value={loading ? "…" : formatNumber(metrics.totalIssued)}
          hint={`${formatNumber(filtered.length)} en vista actual`}
        />
        <MetricCard
          icon={<Users className="size-4 text-sky-600 dark:text-sky-300" />}
          label="Ya ingresaron"
          value={loading ? "…" : formatNumber(metrics.checkedIn)}
          hint={`${checkedInPct}% del total`}
        />
        <MetricCard
          icon={<Search className="size-4 text-amber-600 dark:text-amber-200" />}
          label="Pendientes de ingreso"
          value={loading ? "…" : formatNumber(metrics.pending)}
          hint="Entradas válidas sin check-in"
        />
        <MetricCard
          icon={<RefreshCw className="size-4 text-orange-600 dark:text-orange-300" />}
          label="Transferidos"
          value={loading ? "…" : formatNumber(metrics.transferred)}
          hint="QR originales invalidados"
        />
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-card p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscá por nombre, DNI, email, código o historial de transferencia…"
            className="h-14 rounded-2xl border-border bg-background pl-12 text-base text-foreground placeholder:text-muted-foreground"
            aria-label="Buscar entradas emitidas"
          />
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as StatusTab)}
          className="gap-4"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-muted/80 p-1.5 group-data-horizontal/tabs:h-auto">
            {TAB_LABELS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="rounded-xl px-3 py-2 text-xs data-active:bg-background data-active:text-foreground sm:text-sm"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="overflow-hidden rounded-2xl border border-border max-md:border-0 max-md:bg-transparent">
          {/* Mobile: tarjetas apiladas */}
          <div className="grid gap-3 md:hidden">
            {loading ? (
              <p className="rounded-2xl border border-border px-4 py-12 text-center text-sm text-muted-foreground">
                Cargando entradas…
              </p>
            ) : filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                No hay entradas que coincidan.
              </p>
            ) : (
              filtered.map((ticket) => (
                <article
                  key={ticket.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-foreground">
                        {ticket.holderName}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {ticket.holderEmail}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        DNI {ticket.holderDni}
                      </p>
                    </div>
                    <StatusBadge ticket={ticket} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-black text-foreground">
                        #{ticket.code}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ticket.sectorLabel}
                      </p>
                    </div>
                    <RowActionsMenu
                      ticket={ticket}
                      onResend={() => openModal("resend", ticket)}
                      onPrint={() => handlePrint(ticket)}
                      onEditHolder={() => openModal("holder", ticket)}
                      onTransfer={() => openModal("transfer", ticket)}
                      onCancel={() => openModal("cancel", ticket)}
                    />
                  </div>
                  <TransferLinkChip
                    ticket={ticket}
                    onOpenCustody={() => openModal("custody", ticket)}
                  />
                </article>
              ))
            )}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="px-4 bg-muted/50 text-muted-foreground">Comprador</TableHead>
                <TableHead className="px-4 bg-muted/50 text-muted-foreground">
                  Ubicación / Entrada
                </TableHead>
                <TableHead className="px-4 bg-muted/50 text-muted-foreground">Código</TableHead>
                <TableHead className="px-4 bg-muted/50 text-muted-foreground">Estado</TableHead>
                <TableHead className="px-4 text-right bg-muted/50 text-muted-foreground">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Cargando entradas emitidas…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No hay entradas que coincidan con la búsqueda o el filtro.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="border-b border-border hover:bg-muted/50"
                  >
                    <TableCell className="px-4 py-3 align-top">
                      <p className="font-semibold text-foreground">
                        {ticket.holderName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ticket.holderEmail}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        DNI {ticket.holderDni}
                      </p>
                      <TransferLinkChip
                        ticket={ticket}
                        onOpenCustody={() => openModal("custody", ticket)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate px-4 py-3 text-sm text-foreground">
                      {ticket.sectorLabel}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm text-foreground">
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
        </div>

        <p className="text-xs text-muted-foreground">
          Evento{" "}
          <span className="font-medium text-foreground">
            {eventTitle}
          </span>
          . Mostrando {formatNumber(filtered.length)} de{" "}
          {formatNumber(metrics.totalIssued)} entradas emitidas.
        </p>
      </section>

      <Dialog
        open={modal === "resend"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reenviar entrada</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {activeTicket
                ? `#${activeTicket.code} · ${activeTicket.holderName}`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              className="h-11 justify-start rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={actionPending}
              onClick={() => void confirmResend("email")}
            >
              <Mail className="size-4" />
              {actionPending ? "Enviando…" : "Reenviar por email"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start rounded-xl border-border bg-muted text-foreground"
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
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar titular / Email</DialogTitle>
            <DialogDescription className="text-muted-foreground">
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
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holder-email">Email</Label>
              <Input
                id="holder-email"
                type="email"
                value={holderEmail}
                onChange={(e) => setHolderEmail(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holder-dni">DNI</Label>
              <Input
                id="holder-dni"
                value={holderDni}
                onChange={(e) => setHolderDni(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="text-muted-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmHolderUpdate()}
              disabled={actionPending}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {actionPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "transfer"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir / Reasignar</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {activeTicket
                ? `Se invalida #${activeTicket.code} y se emite un QR nuevo al destinatario.`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-200">
              El QR actual dejará de pasar en puerta. Queda registro en la
              cadena de custodia.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-name">Nombre y apellido</Label>
              <Input
                id="transfer-name"
                value={transferName}
                onChange={(e) => setTransferName(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-email">Email del nuevo titular</Label>
              <Input
                id="transfer-email"
                type="email"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-dni">DNI</Label>
              <Input
                id="transfer-dni"
                value={transferDni}
                onChange={(e) => setTransferDni(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="text-muted-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmTransfer()}
              disabled={actionPending}
              className="rounded-xl bg-amber-500 text-zinc-950 hover:bg-amber-400"
            >
              <RefreshCw className="size-4" />
              {actionPending ? "Reasignando…" : "Confirmar transferencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "custody"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto border-border bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadena de custodia</DialogTitle>
            <DialogDescription className="text-muted-foreground">
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
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inhabilitar ticket</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {activeTicket
                ? `Vas a anular #${activeTicket.code} de ${activeTicket.holderName}. El QR dejará de pasar en puerta.`
                : "Seleccioná una entrada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Motivo de anulación</Label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej. duplicado, reclamo, fraude…"
                className="border-border bg-muted"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              disabled={actionPending}
              className="text-muted-foreground"
            >
              Volver
            </Button>
            <Button
              type="button"
              onClick={() => void confirmCancel()}
              disabled={actionPending}
              className="rounded-xl bg-red-600 text-white hover:bg-red-500"
            >
              <Ban className="size-4" />
              {actionPending ? "Anulando…" : "Anular ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "courtesy"}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Emitir entrada manual / Cortesía</DialogTitle>
            <DialogDescription className="text-muted-foreground">
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
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-email">Email</Label>
              <Input
                id="courtesy-email"
                type="email"
                value={courtesyEmail}
                onChange={(e) => setCourtesyEmail(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-dni">DNI</Label>
              <Input
                id="courtesy-dni"
                value={courtesyDni}
                onChange={(e) => setCourtesyDni(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courtesy-sector">Sector / ubicación</Label>
              <Input
                id="courtesy-sector"
                value={courtesySector}
                onChange={(e) => setCourtesySector(e.target.value)}
                className="border-border bg-muted"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="text-muted-foreground"
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
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
