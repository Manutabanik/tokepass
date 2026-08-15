"use client"

import {
  Banknote,
  Ban,
  CreditCard,
  KeyRound,
  LoaderCircle,
  Lock,
  Minus,
  Plus,
  Printer,
  Smartphone,
  Ticket,
  Unlock,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  closeCashierShift,
  createPosSale,
  getOpenCashierShift,
  listOpenShiftOrders,
  openCashierShift,
  setPosSupervisorPin,
  voidPosOrder,
  type CashierShiftRow,
  type PosEventOption,
  type PosShiftOrder,
  type TicketZReport,
} from "@/app/actions/pos"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/format"
import { cashChangeDue, cashTenderSuggestions, resolvePosBuyer } from "@/lib/pos-cash"
import {
  bumpPosCart,
  posCartItemCount,
  posCartLines,
  splitPosQuantity,
  type PosCart,
} from "@/lib/pos-cart"
import {
  printTicketsViaHiddenIframe,
  printUrlViaHiddenIframe,
} from "@/lib/pos-thermal-print"
import { cn } from "@/lib/utils"

type PayMethod = "cash_pos" | "transfer_pos" | "card_pos"

const LAST_TICKETS_KEY = "tokepass.pos.lastTicketIds"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return target.isContentEditable
}

export function PosTerminal({ events }: { events: PosEventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "")
  const [cart, setCart] = useState<PosCart>({})
  const [soldDelta, setSoldDelta] = useState<Record<string, number>>({})
  const [phone, setPhone] = useState("")
  const [dni, setDni] = useState("")
  const [buyerName, setBuyerName] = useState("")
  const [expressSale, setExpressSale] = useState(true)
  const [payMethod, setPayMethod] = useState<PayMethod>("cash_pos")
  const [tendered, setTendered] = useState<number | null>(null)
  const [customTender, setCustomTender] = useState("")
  const [shift, setShift] = useState<CashierShiftRow | null>(null)
  const [shiftLoading, setShiftLoading] = useState(true)
  const [openCashAmount, setOpenCashAmount] = useState("0")
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [countedAmount, setCountedAmount] = useState("")
  const [isPending, startTransition] = useTransition()
  const [lastTicketIds, setLastTicketIds] = useState<string[]>([])
  const [pinModal, setPinModal] = useState<{
    mode: "courtesy" | "void" | "config"
    orderId?: string
  } | null>(null)
  const [supervisorPin, setSupervisorPin] = useState("")
  const [configPin, setConfigPin] = useState("")
  const [voidOrders, setVoidOrders] = useState<PosShiftOrder[]>([])
  const [voidModal, setVoidModal] = useState(false)
  const [zReport, setZReport] = useState<TicketZReport | null>(null)

  const clearTimerRef = useRef<number | null>(null)
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const dialogsOpen =
    openModal || closeModal || !!pinModal || voidModal || !!zReport

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [events, eventId],
  )

  const tiers = selectedEvent?.tiers ?? []

  const liveTiers = useMemo(
    () =>
      tiers.map((tier) => ({
        ...tier,
        available: Math.max(0, tier.available - (soldDelta[tier.id] ?? 0)),
      })),
    [tiers, soldDelta],
  )

  const stockFingerprint = useMemo(
    () => tiers.map((tier) => `${tier.id}:${tier.available}`).join("|"),
    [tiers],
  )

  useEffect(() => {
    setSoldDelta({})
  }, [stockFingerprint])

  const lines = useMemo(
    () =>
      posCartLines(cart)
        .map((line) => {
          const tier = liveTiers.find((item) => item.id === line.tierId)
          if (!tier) return null
          return { ...line, tier }
        })
        .filter((line): line is NonNullable<typeof line> => line != null),
    [cart, liveTiers],
  )

  const total = lines.reduce(
    (sum, line) => sum + line.tier.price * line.quantity,
    0,
  )
  const itemCount = posCartItemCount(cart)
  const needsPin = lines.some((line) => line.tier.requiresSupervisorPin)
  const cashSuggestions = cashTenderSuggestions(total)
  const effectiveTender =
    payMethod === "cash_pos" ? (tendered ?? total) : total
  const changeDue =
    payMethod === "cash_pos" ? cashChangeDue(total, effectiveTender) : 0

  const resetSaleForm = useCallback(() => {
    setCart({})
    setPhone("")
    setDni("")
    setBuyerName("")
    setExpressSale(true)
    setPayMethod("cash_pos")
    setTendered(null)
    setCustomTender("")
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_TICKETS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        setLastTicketIds(parsed.filter((id): id is string => typeof id === "string"))
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!eventId) {
      setShift(null)
      setShiftLoading(false)
      return
    }
    let cancelled = false
    setShiftLoading(true)
    void getOpenCashierShift(eventId).then((row) => {
      if (cancelled) return
      setShift(row)
      setShiftLoading(false)
      if (!row) setOpenModal(true)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current != null) {
        window.clearTimeout(clearTimerRef.current)
      }
    }
  }, [])

  function persistLastTickets(ids: string[]) {
    setLastTicketIds(ids)
    try {
      localStorage.setItem(LAST_TICKETS_KEY, JSON.stringify(ids))
    } catch {
      // ignore
    }
  }

  function onEventChange(nextEventId: string) {
    setEventId(nextEventId)
    setCart({})
    setSoldDelta({})
    setTendered(null)
    setCustomTender("")
  }

  function addTier(tierId: string, delta = 1) {
    const tier = liveTiers.find((item) => item.id === tierId)
    if (!tier || !shift) return
    setCart((current) => bumpPosCart(current, tierId, delta, tier.available))
  }

  function handleOpenShift() {
    if (!eventId || isPending) return
    const amount = Number(openCashAmount.replace(",", "."))
    startTransition(async () => {
      const res = await openCashierShift({
        eventId,
        startAmount: Number.isFinite(amount) ? amount : 0,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setShift(res.shift)
      setOpenModal(false)
      toast.success("Caja abierta")
    })
  }

  function handleCloseShift() {
    if (!shift || isPending) return
    const counted = countedAmount.trim()
      ? Number(countedAmount.replace(",", "."))
      : null
    startTransition(async () => {
      const res = await closeCashierShift({
        shiftId: shift.id,
        countedAmount:
          counted != null && Number.isFinite(counted) ? counted : null,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Turno cerrado · imprimiendo Ticket Z")
      setCloseModal(false)
      setShift(null)
      setOpenModal(true)
      setCountedAmount("")
      setZReport(res.zReport)
      void printUrlViaHiddenIframe(`/admin/pos/z/${res.shift.id}`).catch(() => {
        toast.message("Abrí de nuevo el Ticket Z si no salió la impresión.")
      })
    })
  }

  function requestEmit() {
    if (!eventId || !shift || isPending || lines.length === 0) return
    if (needsPin) {
      setSupervisorPin("")
      setPinModal({ mode: "courtesy" })
      return
    }
    runSale(null)
  }

  function runSale(pin: string | null) {
    if (!eventId || !shift || lines.length === 0) return
    const buyer = resolvePosBuyer({
      express: expressSale,
      dni,
      name: buyerName,
    })
    const snapshot = lines.map((line) => ({
      tierId: line.tierId,
      quantity: line.quantity,
      price: line.tier.price,
    }))

    startTransition(async () => {
      const issuedIds: string[] = []
      let billed = 0
      const remaining: PosCart = {}
      let failed = false

      for (let index = 0; index < snapshot.length; index++) {
        const line = snapshot[index]
        const chunks = splitPosQuantity(line.quantity)
        let leftover = line.quantity

        for (const quantity of chunks) {
          const sale = await createPosSale({
            eventId,
            tierId: line.tierId,
            quantity,
            paymentMethod: payMethod,
            customerPhone: phone,
            customerDni: buyer.dni,
            customerName: buyer.name,
            shiftId: shift.id,
            supervisorPin: pin,
          })

          if (!sale.success) {
            remaining[line.tierId] = leftover
            for (let rest = index + 1; rest < snapshot.length; rest++) {
              remaining[snapshot[rest].tierId] = snapshot[rest].quantity
            }
            toast.error(sale.error)
            if (sale.error.toLowerCase().includes("abrir la caja")) {
              setOpenModal(true)
            }
            failed = true
            break
          }

          leftover -= quantity
          billed += sale.totalAmount
          issuedIds.push(...sale.tickets.map((ticket) => ticket.id))
          setSoldDelta((current) => ({
            ...current,
            [line.tierId]: (current[line.tierId] ?? 0) + quantity,
          }))
        }

        if (failed) break
      }

      if (issuedIds.length > 0) {
        persistLastTickets(issuedIds)
        void printTicketsViaHiddenIframe(issuedIds).catch(() => {
          toast.message("Usá Reimprimir si el papel se trabó.")
        })
        setShift((current) => {
          if (!current) return current
          return {
            ...current,
            cashSalesTotal:
              current.cashSalesTotal + (payMethod === "cash_pos" ? billed : 0),
            cardSalesTotal:
              current.cardSalesTotal + (payMethod === "card_pos" ? billed : 0),
            transferSalesTotal:
              current.transferSalesTotal +
              (payMethod === "transfer_pos" ? billed : 0),
            ticketsSold: current.ticketsSold + issuedIds.length,
          }
        })
        const next = await getOpenCashierShift(eventId)
        if (next) setShift(next)
      }

      if (failed) {
        setCart(remaining)
        setPinModal(null)
        setSupervisorPin("")
        return
      }

      const labels: Record<PayMethod, string> = {
        cash_pos: "Cobrado en efectivo",
        card_pos: "Cobrado con Posnet / tarjeta",
        transfer_pos: "Cobrado por QR / transferencia",
      }
      toast.success(
        needsPin || billed === 0 ? "Cortesía emitida" : labels[payMethod],
      )
      setPinModal(null)
      setSupervisorPin("")
      if (clearTimerRef.current != null) {
        window.clearTimeout(clearTimerRef.current)
      }
      clearTimerRef.current = window.setTimeout(() => {
        resetSaleForm()
      }, 100)
    })
  }

  function handleReprint() {
    if (lastTicketIds.length === 0) {
      toast.error("No hay un ticket reciente para reimprimir.")
      return
    }
    startTransition(async () => {
      try {
        await printTicketsViaHiddenIframe(lastTicketIds)
        toast.success("Reimpresión enviada")
      } catch {
        toast.error("No se pudo reimprimir. Probá de nuevo.")
      }
    })
  }

  function openVoidList() {
    if (!shift) return
    startTransition(async () => {
      const rows = await listOpenShiftOrders(shift.id)
      setVoidOrders(rows)
      setVoidModal(true)
    })
  }

  function confirmVoid(orderId: string) {
    setSupervisorPin("")
    setPinModal({ mode: "void", orderId })
  }

  function submitPin() {
    if (!pinModal) return
    if (pinModal.mode === "config") {
      if (!eventId) return
      startTransition(async () => {
        const res = await setPosSupervisorPin({
          eventId,
          pin: configPin || supervisorPin,
        })
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success("PIN de Autorización guardado")
        setPinModal(null)
        setConfigPin("")
        setSupervisorPin("")
        window.location.reload()
      })
      return
    }

    if (supervisorPin.trim().length < 4) {
      toast.error("Ingresá el PIN de Autorización")
      return
    }

    if (pinModal.mode === "courtesy") {
      runSale(supervisorPin.trim())
      return
    }

    if (pinModal.mode === "void" && pinModal.orderId) {
      startTransition(async () => {
        const res = await voidPosOrder({
          orderId: pinModal.orderId!,
          supervisorPin: supervisorPin.trim(),
        })
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success("Venta anulada")
        setPinModal(null)
        setSupervisorPin("")
        setVoidModal(false)
        if (eventId) {
          const next = await getOpenCashierShift(eventId)
          if (next) setShift(next)
        }
      })
    }
  }

  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (dialogsOpen) return
    const typing = isTypingTarget(event.target)

    if (event.key === "Escape") {
      event.preventDefault()
      resetSaleForm()
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      requestEmit()
      return
    }

    if (event.key === "F1") {
      event.preventDefault()
      setPayMethod("cash_pos")
      return
    }
    if (event.key === "F2") {
      event.preventDefault()
      setPayMethod("card_pos")
      return
    }
    if (event.key === "F3") {
      event.preventDefault()
      setPayMethod("transfer_pos")
      return
    }

    if (typing || event.ctrlKey || event.metaKey || event.altKey) return
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault()
      const tier = liveTiers[Number(event.key) - 1]
      if (tier) addTier(tier.id)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      keyHandlerRef.current(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (events.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card px-5 py-12 text-center">
        <Ticket className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          No hay eventos disponibles para cobrar en puerta.
        </p>
      </div>
    )
  }

  const cashExpected = (shift?.startAmount ?? 0) + (shift?.cashSalesTotal ?? 0)
  const canSell = Boolean(shift) && !isPending

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card px-3 py-3 sm:px-4">
        {shift ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-200">
                <Unlock className="size-3.5" />
                Caja abierta
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Fondo {formatCurrency(shift.startAmount)} · Cash{" "}
                {formatCurrency(shift.cashSalesTotal)} · Esperado{" "}
                {formatCurrency(cashExpected)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0 rounded-xl border-emerald-500/40"
              onClick={() => setCloseModal(true)}
            >
              <Lock className="size-4" />
              Cerrar Turno (Ticket Z)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl"
              disabled={isPending || lastTicketIds.length === 0}
              onClick={handleReprint}
            >
              <Printer className="size-4" />
              Reimprimir
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl border-red-500/40 text-rose-600 dark:text-rose-200"
              disabled={isPending}
              onClick={openVoidList}
            >
              <Ban className="size-4" />
              Anular
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 rounded-xl"
              onClick={() => {
                setSupervisorPin("")
                setConfigPin("")
                setPinModal({ mode: "config" })
              }}
            >
              <KeyRound className="size-4" />
              PIN
            </Button>
          </div>
        ) : (
          <p className="text-sm text-amber-600 dark:text-amber-200">
            {shiftLoading
              ? "Revisando turno…"
              : "Abrí la caja para empezar a cobrar."}
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
        <section className="min-h-0 overflow-y-auto border-border p-3 sm:p-4 lg:border-r">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Evento activo</Label>
            <Select
              value={eventId}
              onValueChange={(value) => value && onEventChange(value)}
              items={events.map((event) => ({
                value: event.id,
                label: event.title,
              }))}
            >
              <SelectTrigger className="h-14 w-full max-w-full overflow-hidden rounded-2xl border-border bg-card text-base text-foreground">
                <SelectValue placeholder="Elegí evento">
                  {selectedEvent?.title ?? null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    <span className="block max-w-[220px] truncate sm:max-w-[420px]">
                      {event.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset disabled={!canSell} className="mt-4 disabled:opacity-50">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {liveTiers.map((tier, index) => {
                const inCart = cart[tier.id] ?? 0
                const soldOut = tier.available <= 0
                return (
                  <button
                    key={tier.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => addTier(tier.id)}
                    className={cn(
                      "flex min-h-36 flex-col items-start justify-between rounded-2xl border-2 bg-card p-4 text-left transition active:scale-[0.98]",
                      inCart > 0
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-border hover:border-emerald-500/50",
                      soldOut && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="text-lg font-bold leading-tight text-foreground">
                        {tier.name}
                      </span>
                      {index < 9 ? (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-black tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-2xl font-black tabular-nums text-foreground">
                      {tier.requiresSupervisorPin
                        ? "Cortesía"
                        : formatCurrency(tier.price)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {Math.max(0, tier.available - inCart)} disponibles
                      {inCart > 0 ? ` · ${inCart} en carrito` : ""}
                    </p>
                  </button>
                )
              })}
            </div>
          </fieldset>
        </section>

        <aside className="flex min-h-0 flex-col border-t border-border bg-card lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Carrito
              </p>
              {lines.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Tocá un tipo de entrada para sumar +1.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {lines.map((line) => (
                    <li
                      key={line.tierId}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{line.tier.name}</p>
                        <p className="text-sm font-bold tabular-nums">
                          {formatCurrency(line.tier.price * line.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-11 rounded-full"
                          disabled={!canSell}
                          onClick={() => addTier(line.tierId, -1)}
                        >
                          <Minus />
                        </Button>
                        <span className="w-7 text-center text-xl font-black tabular-nums">
                          {line.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-11 rounded-full"
                          disabled={!canSell || line.quantity >= line.tier.available}
                          onClick={() => addTier(line.tierId, 1)}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              disabled={!canSell}
              onClick={() => setExpressSale((value) => !value)}
              className={cn(
                "flex min-h-12 w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left font-semibold",
                expressSale
                  ? "border-emerald-500 bg-emerald-500/15 text-foreground"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              <span>Venta Express (Consumidor Final)</span>
              <span className="text-xs font-black uppercase tracking-wide">
                {expressSale ? "ON" : "OFF"}
              </span>
            </button>

            {!expressSale ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="pos-dni" className="text-muted-foreground">
                    DNI / Nombre{" "}
                    <span className="font-semibold text-foreground">(Opcional)</span>
                  </Label>
                  <Input
                    id="pos-dni"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="DNI (opcional)"
                    value={dni}
                    onChange={(e) =>
                      setDni(e.target.value.replace(/\D/g, "").slice(0, 11))
                    }
                    className="h-12 rounded-2xl border-border bg-background text-base"
                  />
                </div>
                <Input
                  id="pos-name"
                  autoComplete="name"
                  placeholder="Nombre (opcional)"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="h-12 rounded-2xl border-border bg-background text-base"
                />
                <Input
                  id="pos-phone"
                  inputMode="tel"
                  placeholder="WhatsApp (opcional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 rounded-2xl border-border bg-background text-base"
                />
              </div>
            ) : null}

            <div className="rounded-2xl border border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Total · {itemCount} {itemCount === 1 ? "ítem" : "ítems"}
                </span>
                <span className="text-3xl font-black tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <PayMethodButton
                active={payMethod === "cash_pos"}
                disabled={!canSell}
                onClick={() => setPayMethod("cash_pos")}
                icon={<Banknote className="size-5" />}
                label="EFECTIVO (F1)"
              />
              <PayMethodButton
                active={payMethod === "card_pos"}
                disabled={!canSell}
                onClick={() => setPayMethod("card_pos")}
                icon={<CreditCard className="size-5" />}
                label="TARJETA / POSNET (F2)"
              />
              <PayMethodButton
                active={payMethod === "transfer_pos"}
                disabled={!canSell}
                onClick={() => setPayMethod("transfer_pos")}
                icon={<Smartphone className="size-5" />}
                label="QR / TRANSFERENCIA (F3)"
              />
            </div>

            {payMethod === "cash_pos" && total > 0 ? (
              <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                  Pago en efectivo
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {cashSuggestions.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      disabled={!canSell}
                      onClick={() => {
                        setTendered(amount)
                        setCustomTender("")
                      }}
                      className={cn(
                        "min-h-12 rounded-xl border-2 px-2 text-sm font-black tabular-nums",
                        tendered === amount
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-background",
                      )}
                    >
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
                <Input
                  inputMode="decimal"
                  placeholder="Otro monto recibido"
                  value={customTender}
                  onChange={(e) => {
                    setCustomTender(e.target.value)
                    const parsed = Number(e.target.value.replace(",", "."))
                    setTendered(Number.isFinite(parsed) && parsed > 0 ? parsed : null)
                  }}
                  className="h-12 rounded-xl bg-background text-base"
                />
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Vuelto
                  </p>
                  <p className="text-5xl font-black tabular-nums text-emerald-600 dark:text-emerald-300">
                    {formatCurrency(changeDue)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-border p-3 sm:p-4">
            <button
              type="button"
              disabled={!canSell || lines.length === 0}
              onClick={requestEmit}
              className="inline-flex h-16 w-full items-center justify-center rounded-2xl bg-emerald-500 text-xl font-black text-white hover:bg-emerald-600 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                "EMITIR E IMPRIMIR TICKET (ENTER)"
              )}
            </button>
          </div>
        </aside>
      </div>

      <Dialog
        open={openModal && !shift}
        onOpenChange={(open) => {
          if (!open && !shift) return
          setOpenModal(open)
        }}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Ingresá el fondo inicial antes de cobrar en{" "}
              {selectedEvent?.title ?? "este evento"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="open-cash">Fondo inicial ($)</Label>
            <Input
              id="open-cash"
              inputMode="decimal"
              value={openCashAmount}
              onChange={(e) => setOpenCashAmount(e.target.value)}
              className="min-h-12 text-base"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleOpenShift}
              className="min-h-12 w-full rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Unlock className="size-4" />
              )}
              Abrir caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeModal} onOpenChange={setCloseModal}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar Turno (Ticket Z)</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Se imprime el resumen 80mm al confirmar.
            </DialogDescription>
          </DialogHeader>
          {shift ? (
            <div className="space-y-3 rounded-2xl border border-border p-4 text-sm">
              <Row label="Fondo inicial" value={formatCurrency(shift.startAmount)} />
              <Row
                label="Ventas efectivo"
                value={formatCurrency(shift.cashSalesTotal)}
              />
              <Row
                label="Ventas Posnet"
                value={formatCurrency(shift.cardSalesTotal)}
              />
              <Row
                label="Transferencias"
                value={formatCurrency(shift.transferSalesTotal)}
              />
              <Row label="Entradas emitidas" value={String(shift.ticketsSold)} />
              <div className="border-t border-border pt-3">
                <Row
                  label="Efectivo a entregar"
                  value={formatCurrency(cashExpected)}
                  strong
                />
              </div>
              <div className="space-y-2 pt-2">
                <Label htmlFor="counted">Conteo real (opcional)</Label>
                <Input
                  id="counted"
                  inputMode="decimal"
                  value={countedAmount}
                  onChange={(e) => setCountedAmount(e.target.value)}
                  placeholder={String(cashExpected)}
                  className="min-h-12 text-base"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCloseModal(false)}
              className="min-h-12"
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleCloseShift}
              className="min-h-12 bg-red-600 font-bold text-white hover:bg-red-500"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              Cerrar Turno (Ticket Z)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pinModal}
        onOpenChange={(open) => {
          if (!open) setPinModal(null)
        }}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pinModal?.mode === "config"
                ? "Configurar PIN de Autorización"
                : pinModal?.mode === "void"
                  ? "Anular Venta"
                  : "Requiere PIN de Supervisor"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {pinModal?.mode === "config"
                ? "Solo organizador/admin. 4 a 12 caracteres."
                : "Pedile el PIN al supervisor para continuar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="supervisor-pin">PIN de Autorización</Label>
            <Input
              id="supervisor-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinModal?.mode === "config" ? configPin : supervisorPin}
              onChange={(e) =>
                pinModal?.mode === "config"
                  ? setConfigPin(e.target.value.slice(0, 12))
                  : setSupervisorPin(e.target.value.slice(0, 12))
              }
              className="min-h-12 text-base tracking-widest"
            />
            {!selectedEvent?.hasSupervisorPin && pinModal?.mode !== "config" ? (
              <p className="text-xs text-amber-600 dark:text-amber-200">
                Este evento todavía no tiene PIN. Configuralo con el botón PIN
                (organizador) o usá el código ORG si sos el organizador.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={isPending}
              onClick={submitPin}
              className="min-h-12 w-full rounded-xl"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidModal} onOpenChange={setVoidModal}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular Venta</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Solo ventas del turno abierto. Pedirá PIN de Autorización.
            </DialogDescription>
          </DialogHeader>
          {voidOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ventas para anular.</p>
          ) : (
            <ul className="space-y-2">
              {voidOrders.map((order) => (
                <li
                  key={order.orderId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {order.tierName ?? "Entrada"} · {order.ticketCount} QR
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.holderName ?? "—"}
                      {order.holderDni ? ` · DNI ${order.holderDni}` : ""} ·{" "}
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shrink-0 rounded-xl border-red-500/40 text-rose-600 dark:text-rose-200"
                    onClick={() => confirmVoid(order.orderId)}
                  >
                    Anular
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!zReport}
        onOpenChange={(open) => {
          if (!open) setZReport(null)
        }}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ticket Z listo</DialogTitle>
            <DialogDescription>
              Si la impresora no respondió, reimprimí el cierre.
            </DialogDescription>
          </DialogHeader>
          {zReport ? (
            <Button
              type="button"
              className="min-h-12 w-full rounded-xl"
              onClick={() => {
                void printUrlViaHiddenIframe(`/admin/pos/z/${zReport.shiftId}`)
              }}
            >
              <Printer className="size-4" />
              Reimprimir Ticket Z
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PayMethodButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-sm font-black tracking-wide",
        active
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-border bg-background text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong
            ? "text-base font-black text-emerald-600 dark:text-emerald-200"
            : "font-semibold text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  )
}
