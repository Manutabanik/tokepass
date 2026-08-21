"use client"

import {
  Banknote,
  Ban,
  CreditCard,
  KeyRound,
  LayoutGrid,
  LoaderCircle,
  Lock,
  Map as MapIcon,
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
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  bootstrapPosCashierPin,
  closeCashierShift,
  createPosSale,
  getOpenCashierShift,
  getPosPinContext,
  listOpenShiftOrders,
  listShiftReprintReceipts,
  openCashierShift,
  setPosSupervisorPin,
  verifyPosCashierPin,
  voidPosOrder,
  type CashierShiftRow,
  type PosEventOption,
  type PosPinContext,
  type PosReprintRow,
  type PosShiftOrder,
  type PosThermalReceipt,
  type TicketZReport,
} from "@/app/actions/pos"
import { PosNumpad } from "@/components/admin/pos-numpad"
import { PosSeatingMap } from "@/components/admin/pos-seating-map"
import { PosThermalReceiptStack } from "@/components/admin/pos-thermal-receipt"
import { PosTicketHandoffDialog } from "@/components/admin/pos-ticket-handoff"
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
import { isSandboxEventStatus } from "@/lib/events/review-status"
import { formatCurrency } from "@/lib/format"
import { cashChangeDue, cashTenderSuggestions, resolvePosBuyer } from "@/lib/pos-cash"
import {
  bumpPosCart,
  posCartItemCount,
  posCartLines,
  posSeatPicksForTier,
  splitPosQuantity,
  togglePosSeatPick,
  type PosCart,
  type PosSeatPick,
} from "@/lib/pos-cart"
import { armPosSaleBeep, playPosSaleBeep } from "@/lib/pos-sale-beep"
import {
  printThermalNodeNow,
  printUrlViaHiddenIframe,
} from "@/lib/pos-thermal-print"
import { cn } from "@/lib/utils"

type PayMethod = "cash_pos" | "transfer_pos" | "card_pos"

const LAST_TICKETS_KEY = "tokepass.pos.lastTicketIds"
const LAST_TICKETS_EVENT = "tokepass-pos-last-tickets"
const EMPTY_LAST_TICKET_IDS: string[] = []

let lastTicketIdsRaw: string | null = null
let lastTicketIdsSnapshot: string[] = EMPTY_LAST_TICKET_IDS

function readLastTicketIds(): string[] {
  if (typeof window === "undefined") return EMPTY_LAST_TICKET_IDS
  try {
    const raw = localStorage.getItem(LAST_TICKETS_KEY)
    if (raw === lastTicketIdsRaw) return lastTicketIdsSnapshot
    lastTicketIdsRaw = raw
    if (!raw) {
      lastTicketIdsSnapshot = EMPTY_LAST_TICKET_IDS
      return lastTicketIdsSnapshot
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      lastTicketIdsSnapshot = EMPTY_LAST_TICKET_IDS
      return lastTicketIdsSnapshot
    }
    lastTicketIdsSnapshot = parsed.filter(
      (id): id is string => typeof id === "string",
    )
    return lastTicketIdsSnapshot
  } catch {
    lastTicketIdsSnapshot = EMPTY_LAST_TICKET_IDS
    return lastTicketIdsSnapshot
  }
}

function readLastTicketIdsServer(): string[] {
  return EMPTY_LAST_TICKET_IDS
}

function subscribeLastTicketIds(onChange: () => void) {
  window.addEventListener(LAST_TICKETS_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(LAST_TICKETS_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return target.isContentEditable
}

export function PosTerminal({ events }: { events: PosEventOption[] }) {
  const catalog = useMemo(
    () => (Array.isArray(events) ? events : []),
    [events],
  )
  const [eventId, setEventId] = useState(catalog[0]?.id ?? "")
  const [cart, setCart] = useState<PosCart>({})
  const [soldDelta, setSoldDelta] = useState<Record<string, number>>({})
  const [soldDeltaKey, setSoldDeltaKey] = useState("")
  const [phone, setPhone] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [dni, setDni] = useState("")
  const [buyerName, setBuyerName] = useState("")
  const [expressSale, setExpressSale] = useState(true)
  const [payMethod, setPayMethod] = useState<PayMethod>("cash_pos")
  const [tendered, setTendered] = useState<number | null>(null)
  const [customTender, setCustomTender] = useState("")
  const [shiftRecord, setShiftRecord] = useState<{
    eventId: string
    row: CashierShiftRow | null
    loading: boolean
  }>({
    eventId: catalog[0]?.id ?? "",
    row: null,
    loading: Boolean(catalog[0]?.id),
  })
  const [openCashAmount, setOpenCashAmount] = useState("0")
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [countedAmount, setCountedAmount] = useState("")
  const [isPending, startTransition] = useTransition()
  const lastTicketIds = useSyncExternalStore(
    subscribeLastTicketIds,
    readLastTicketIds,
    readLastTicketIdsServer,
  )
  const [handoffTickets, setHandoffTickets] = useState<
    Array<{ id: string; totpSecret: string; signedQr?: string }>
  >([])
  const [seatPicks, setSeatPicks] = useState<PosSeatPick[]>([])
  const [catalogView, setCatalogView] = useState<"quick" | "map">("quick")
  const [printReceipts, setPrintReceipts] = useState<PosThermalReceipt[]>([])
  const [reprintModal, setReprintModal] = useState(false)
  const [reprintRows, setReprintRows] = useState<PosReprintRow[]>([])
  const [pinCtx, setPinCtx] = useState<PosPinContext | null>(null)
  const [pinModal, setPinModal] = useState<{
    mode: "courtesy" | "void" | "config" | "unlock" | "setup"
    orderId?: string
    step?: "admin" | "pin"
  } | null>(null)
  const [supervisorPin, setSupervisorPin] = useState("")
  const [configPin, setConfigPin] = useState("")
  const [adminAuthPin, setAdminAuthPin] = useState("")
  const [voidOrders, setVoidOrders] = useState<PosShiftOrder[]>([])
  const [voidModal, setVoidModal] = useState(false)
  const [zReport, setZReport] = useState<TicketZReport | null>(null)

  const clearTimerRef = useRef<number | null>(null)
  const chargeLockRef = useRef(false)
  const [chargeLocked, setChargeLocked] = useState(false)
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const dialogsOpen =
    openModal ||
    closeModal ||
    !!pinModal ||
    voidModal ||
    !!zReport ||
    reprintModal

  const selectedEvent = useMemo(
    () => catalog.find((event) => event.id === eventId) ?? null,
    [catalog, eventId],
  )

  const tiers = useMemo(
    () => selectedEvent?.tiers ?? [],
    [selectedEvent],
  )

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
  if (soldDeltaKey !== stockFingerprint) {
    setSoldDeltaKey(stockFingerprint)
    setSoldDelta({})
  }

  const shift = !eventId
    ? null
    : shiftRecord.eventId === eventId
      ? shiftRecord.row
      : null
  const shiftLoading =
    Boolean(eventId) &&
    (shiftRecord.eventId !== eventId || shiftRecord.loading)

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
    setSeatPicks([])
    setPhone("")
    setBuyerEmail("")
    setDni("")
    setBuyerName("")
    setExpressSale(true)
    setPayMethod("cash_pos")
    setTendered(null)
    setCustomTender("")
  }, [])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    void getOpenCashierShift(eventId).then((row) => {
      if (cancelled) return
      setShiftRecord({ eventId, row, loading: false })
      if (!row) setOpenModal(true)
    })
    void getPosPinContext(eventId).then((ctx) => {
      if (!cancelled) setPinCtx(ctx)
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
    try {
      localStorage.setItem(LAST_TICKETS_KEY, JSON.stringify(ids))
      window.dispatchEvent(new Event(LAST_TICKETS_EVENT))
    } catch {
      // ignore
    }
  }

  function onEventChange(nextEventId: string) {
    setEventId(nextEventId)
    setCart({})
    setSeatPicks([])
    setSoldDelta({})
    setTendered(null)
    setCustomTender("")
    setCatalogView("quick")
  }

  function addTier(tierId: string, delta = 1) {
    const tier = liveTiers.find((item) => item.id === tierId)
    if (!tier || !shift) return
    if (delta < 0) {
      const picks = posSeatPicksForTier(seatPicks, tierId)
      if (picks.length > 0) {
        const last = picks[picks.length - 1]
        setSeatPicks((current) =>
          current.filter((item) => item.seatId !== last.seatId),
        )
      }
    }
    setCart((current) => bumpPosCart(current, tierId, delta, tier.available))
  }

  function toggleMapSeat(pick: PosSeatPick) {
    const tier = liveTiers.find((item) => item.id === pick.tierId)
    if (!tier || !shift) {
      toast.error("No hay tipo de entrada para ese sector.")
      return
    }
    const next = togglePosSeatPick(seatPicks, pick)
    const delta = next.added ? 1 : -1
    if (next.added && (cart[pick.tierId] ?? 0) >= tier.available) {
      toast.error("Sin stock para ese sector.")
      return
    }
    setSeatPicks(next.picks)
    setCart((current) => bumpPosCart(current, pick.tierId, delta, tier.available))
  }

  function openPinModal() {
    setSupervisorPin("")
    setConfigPin("")
    setAdminAuthPin("")
    const hasPin = Boolean(pinCtx?.hasCashierPin || pinCtx?.hasSupervisorPin)
    if (!hasPin) {
      setPinModal({
        mode: "setup",
        step: pinCtx?.canManagePins ? "pin" : "admin",
      })
      return
    }
    setPinModal({ mode: "unlock" })
  }

  function flushThermalPrint(receipts: PosThermalReceipt[]) {
    setPrintReceipts(receipts)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        printThermalNodeNow()
      })
    })
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
      setShiftRecord({ eventId, row: res.shift, loading: false })
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
      setShiftRecord({ eventId, row: null, loading: false })
      setOpenModal(true)
      setCountedAmount("")
      setZReport(res.zReport)
      void printUrlViaHiddenIframe(`/dashboard/pos/z/${res.shift.id}`).catch(() => {
        toast.message("Abrí de nuevo el Ticket Z si no salió la impresión.")
      })
    })
  }

  function beginChargeLock(): boolean {
    if (chargeLockRef.current) return false
    chargeLockRef.current = true
    setChargeLocked(true)
    return true
  }

  function endChargeLock() {
    chargeLockRef.current = false
    setChargeLocked(false)
  }

  function requestEmit() {
    if (!eventId || !shift || lines.length === 0) return
    if (chargeLockRef.current || isPending) return
    armPosSaleBeep()
    if (needsPin) {
      setSupervisorPin("")
      setPinModal({ mode: "courtesy" })
      return
    }
    if (!beginChargeLock()) return
    runSale(null)
  }

  function runSale(pin: string | null) {
    if (!eventId || !shift || lines.length === 0) {
      endChargeLock()
      return
    }
    if (!chargeLockRef.current && !beginChargeLock()) return
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
      const issued: Array<{ id: string; totpSecret: string; signedQr?: string }> = []
      let billed = 0
      const remaining: PosCart = {}
      let failed = false
      const soldBump: Record<string, number> = {}
      try {

      for (let index = 0; index < snapshot.length; index++) {
        const line = snapshot[index]
        const picks = posSeatPicksForTier(seatPicks, line.tierId)
        const units =
          picks.length > 0
            ? picks.map((pick) => ({
                quantity: 1 as const,
                seatingLayoutItemId: pick.seatId,
              }))
            : splitPosQuantity(line.quantity).map((quantity) => ({
                quantity,
                seatingLayoutItemId: null as string | null,
              }))
        let leftover = line.quantity

        for (const unit of units) {
          const sale = await createPosSale({
            eventId,
            tierId: line.tierId,
            quantity: unit.quantity,
            paymentMethod: payMethod,
            customerPhone: phone,
            customerEmail: buyerEmail,
            customerDni: buyer.dni,
            customerName: buyer.name,
            shiftId: shift.id,
            supervisorPin: pin,
            seatingLayoutItemId: unit.seatingLayoutItemId,
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

          leftover -= unit.quantity
          billed += sale.totalAmount
          soldBump[line.tierId] = (soldBump[line.tierId] ?? 0) + unit.quantity
          issued.push(
            ...sale.tickets.map((ticket) => ({
              id: ticket.id,
              totpSecret: ticket.totpSecret,
              signedQr: ticket.signedQr,
            })),
          )
        }

        if (failed) break
      }

      if (
        Object.keys(soldBump).length > 0 &&
        !isSandboxEventStatus(selectedEvent?.status)
      ) {
        setSoldDelta((current) => {
          const next = { ...current }
          for (const [tierId, qty] of Object.entries(soldBump)) {
            next[tierId] = (next[tierId] ?? 0) + qty
          }
          return next
        })
      }

      const issuedIds = issued.map((ticket) => ticket.id)
      if (issuedIds.length > 0) {
        persistLastTickets(issuedIds)
        const receipts: PosThermalReceipt[] = issued.map((ticket, index) => {
          const pick = seatPicks[index]
          const line =
            snapshot.find((item) => item.tierId === pick?.tierId) ?? snapshot[0]
          const tier = liveTiers.find(
            (item) => item.id === (pick?.tierId ?? line?.tierId),
          )
          return {
            ticketId: ticket.id,
            qrPayload: ticket.signedQr || ticket.totpSecret,
            eventTitle: selectedEvent?.title ?? "Evento",
            eventDate: selectedEvent?.date ?? "",
            eventLocation: selectedEvent?.location ?? "",
            tierName: tier?.name ?? "Entrada",
            total: pick?.price ?? line?.price ?? 0,
            holderName: buyer.name,
            holderDni: buyer.dni,
            seatLabel: pick ? `${pick.sectorName} · ${pick.label}` : null,
          }
        })
        flushThermalPrint(receipts)
        playPosSaleBeep()
        setShiftRecord((current) => {
          if (!current.row) return current
          return {
            ...current,
            row: {
              ...current.row,
              cashSalesTotal:
                current.row.cashSalesTotal +
                (payMethod === "cash_pos" ? billed : 0),
              cardSalesTotal:
                current.row.cardSalesTotal +
                (payMethod === "card_pos" ? billed : 0),
              transferSalesTotal:
                current.row.transferSalesTotal +
                (payMethod === "transfer_pos" ? billed : 0),
              ticketsSold: current.row.ticketsSold + issuedIds.length,
            },
          }
        })
        const next = await getOpenCashierShift(eventId)
        if (next) setShiftRecord({ eventId, row: next, loading: false })
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
        setHandoffTickets(issued)
        resetSaleForm()
      }, 100)
      } finally {
        endChargeLock()
      }
    })
  }

  function handleReprint() {
    if (!shift) {
      toast.error("No hay un turno abierto para reimprimir.")
      return
    }
    startTransition(async () => {
      const rows = await listShiftReprintReceipts(shift.id)
      setReprintRows(rows)
      setReprintModal(true)
      if (rows.length === 0 && lastTicketIds.length === 0) {
        toast.error("No hay tickets emitidos en este turno.")
      }
    })
  }

  function printReprintRow(row: PosReprintRow) {
    if (row.receipts.length === 0) {
      toast.error("Ese ticket no tiene datos para imprimir.")
      return
    }
    flushThermalPrint(row.receipts)
    toast.success("Reimpresion enviada")
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

    if (pinModal.mode === "unlock") {
      if (!eventId) return
      const pin = supervisorPin.trim()
      startTransition(async () => {
        if (pinCtx?.hasCashierPin) {
          const res = await verifyPosCashierPin({ eventId, pin })
          if (!res.success) {
            toast.error(res.error)
            return
          }
          toast.success("Cajero autenticado")
          setPinModal(null)
          setSupervisorPin("")
          return
        }
        if (pin.length < 4) {
          toast.error("Ingresa el PIN de autorizacion")
          return
        }
        toast.success("PIN validado")
        setPinModal(null)
        setSupervisorPin("")
      })
      return
    }

    if (pinModal.mode === "setup") {
      if (!eventId) return
      if (pinModal.step === "admin") {
        if (adminAuthPin.trim().length < 4) {
          toast.error("Ingresa el PIN de administrador")
          return
        }
        setPinModal({ mode: "setup", step: "pin" })
        return
      }
      const newPin = configPin.trim()
      if (!/^\d{4}$/.test(newPin)) {
        toast.error("El PIN de caja debe tener 4 digitos")
        return
      }
      startTransition(async () => {
        const boot = await bootstrapPosCashierPin({
          eventId,
          newPin,
          adminPin: adminAuthPin,
        })
        if (!boot.success && pinCtx?.canManagePins) {
          const res = await setPosSupervisorPin({ eventId, pin: newPin })
          if (!res.success) {
            toast.error(boot.error)
            return
          }
        } else if (!boot.success) {
          toast.error(boot.error)
          return
        }
        toast.success("PIN de caja configurado")
        setPinModal(null)
        setConfigPin("")
        setAdminAuthPin("")
        const next = await getPosPinContext(eventId)
        setPinCtx(next)
      })
      return
    }

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
        toast.success("PIN de Autorizacion guardado")
        setPinModal(null)
        setConfigPin("")
        setSupervisorPin("")
        const next = await getPosPinContext(eventId)
        setPinCtx(next)
      })
      return
    }

    if (supervisorPin.trim().length < 4) {
      toast.error("Ingresa el PIN de Autorizacion")
      return
    }

    if (pinModal.mode === "courtesy") {
      if (!beginChargeLock()) return
      armPosSaleBeep()
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
          if (next) setShiftRecord({ eventId, row: next, loading: false })
        }
      })
    }
  }

  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (dialogsOpen) return
      const typing = isTypingTarget(event.target)

      if (event.key === "Escape") {
        event.preventDefault()
        resetSaleForm()
        return
      }

      if (event.key === "Enter") {
        if (event.repeat || chargeLockRef.current) return
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
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      keyHandlerRef.current(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (catalog.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-top))] min-h-0 flex-col overflow-hidden">
      <div className="m-4 rounded-3xl border border-dashed border-border bg-card px-5 py-12 text-center">
        <Ticket className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          No hay eventos disponibles para cobrar en puerta.
        </p>
      </div>
      </div>
    )
  }

  const cashExpected = (shift?.startAmount ?? 0) + (shift?.cashSalesTotal ?? 0)
  const busy = chargeLocked || isPending
  const canSell = Boolean(shift) && !busy

  return (
    <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-top))] min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
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
              Cerrar caja / arqueo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl"
              disabled={isPending}
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
              onClick={openPinModal}
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

      <div className="grid min-h-0 flex-1 overflow-hidden max-lg:grid-rows-[minmax(0,1fr)_minmax(13rem,42%)] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <section className="flex min-h-0 flex-col overflow-hidden border-border lg:border-r">
          <div className="shrink-0 space-y-2 p-4 pb-0">
            <Label className="text-muted-foreground">Evento activo</Label>
            <Select
              value={eventId}
              onValueChange={(value) => value && onEventChange(value)}
              items={catalog.map((event) => ({
                value: event.id,
                label: event.title,
              }))}
            >
              <SelectTrigger className="h-auto min-h-14 w-full max-w-full overflow-hidden whitespace-normal rounded-2xl border-border bg-card text-base text-foreground *:data-[slot=select-value]:line-clamp-2 *:data-[slot=select-value]:whitespace-normal *:data-[slot=select-value]:break-words">
                <SelectValue
                  placeholder="Elegí evento"
                  className="min-w-0 whitespace-normal break-words line-clamp-2"
                >
                  {selectedEvent?.title ?? null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {catalog.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    <span className="block min-w-0 max-w-[220px] break-words line-clamp-2 sm:max-w-[420px]">
                      {event.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset
            disabled={!canSell}
            className="flex min-h-0 flex-1 flex-col overflow-hidden disabled:opacity-50"
          >
            <div className="mb-3 grid shrink-0 grid-cols-2 gap-2 px-4 pt-4">
              <button
                type="button"
                onClick={() => setCatalogView("quick")}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold",
                  catalogView === "quick"
                    ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
                Vista Rapida (Botones)
              </button>
              <button
                type="button"
                onClick={() => setCatalogView("map")}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold",
                  catalogView === "map"
                    ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <MapIcon className="size-4" />
                Vista Mapa (Plano Interactivo)
              </button>
            </div>
            {catalogView === "map" && selectedEvent ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
                <PosSeatingMap
                  event={selectedEvent}
                  heldSeatIds={seatPicks.map((pick) => pick.seatId)}
                  disabled={!canSell}
                  onToggleSeat={toggleMapSeat}
                />
                <p className="mt-2 shrink-0 text-xs text-muted-foreground">
                  Verde: libre · Rojo: ocupado · Amarillo: en cobro
                </p>
              </div>
            ) : null}
            <div
              className={cn(
                "min-h-0 overflow-y-auto p-4",
                catalogView === "map" ? "max-h-48 shrink-0" : "flex-1",
              )}
            >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
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
                      "flex min-h-36 min-w-0 flex-col items-start justify-between rounded-2xl border-2 bg-card p-4 text-left transition active:scale-[0.98]",
                      inCart > 0
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-border hover:border-emerald-500/50",
                      soldOut && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <div className="flex w-full min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 text-lg font-bold leading-tight break-words text-foreground line-clamp-2">
                        {tier.name}
                      </span>
                      {index < 9 ? (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-black tabular-nums text-muted-foreground">
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
            </div>
          </fieldset>
        </section>

        <aside className="flex h-full min-h-0 flex-col border-t border-border bg-card lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Carrito
                </p>
                {isSandboxEventStatus(selectedEvent?.status) ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-100">
                    Modo Prueba Activo - Sin descuento de aforo real
                  </span>
                ) : null}
              </div>
              {lines.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Toca un tipo de entrada o una mesa/butaca del mapa.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {lines.map((line) => (
                    <li
                      key={line.tierId}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="min-w-0 break-words font-semibold line-clamp-2">
                          {line.tier.name}
                        </p>
                        {posSeatPicksForTier(seatPicks, line.tierId).length > 0 ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {posSeatPicksForTier(seatPicks, line.tierId)
                              .map((pick) => `${pick.sectorName} ${pick.label}`)
                              .join(" · ")}
                          </p>
                        ) : null}
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
                <Input
                  id="pos-email"
                  type="email"
                  placeholder="Email (opcional)"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className="h-12 rounded-2xl border-border bg-background text-base"
                />
              </div>
            ) : null}

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

          <div className="shrink-0 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="min-w-0 text-sm text-muted-foreground">
                Total · {itemCount} {itemCount === 1 ? "ítem" : "ítems"}
              </span>
              <span className="text-3xl font-black tabular-nums">
                {formatCurrency(total)}
              </span>
            </div>
            <button
              type="button"
              disabled={!canSell || lines.length === 0}
              onClick={requestEmit}
              aria-busy={busy}
              className="inline-flex h-16 w-full items-center justify-center rounded-2xl bg-emerald-500 text-xl font-black text-white hover:bg-emerald-600 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                "COBRAR E IMPRIMIR (ENTER)"
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
            <DialogTitle>Cierre de caja / arqueo de turno</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Consolidado de efectivo, Posnet y transferencia. Se imprime el
              Ticket Z 80mm al confirmar.
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
              Cerrar caja / arqueo
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
              {pinModal?.mode === "setup"
                ? pinModal.step === "admin"
                  ? "Autorizacion de administrador"
                  : "Crear PIN de caja"
                : pinModal?.mode === "unlock"
                  ? "Validar PIN de cajero"
                  : pinModal?.mode === "config"
                    ? "Configurar PIN de Autorizacion"
                    : pinModal?.mode === "void"
                      ? "Anular Venta"
                      : "Requiere PIN de Supervisor"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {pinModal?.mode === "setup" && pinModal.step === "admin"
                ? "Este cajero no tiene PIN. Un administrador debe autorizar el alta."
                : pinModal?.mode === "setup"
                  ? "Ingresa un PIN numerico de 4 digitos."
                  : pinModal?.mode === "unlock"
                    ? "Validacion rapida del cajero de este turno."
                    : "Ingresa el PIN para continuar."}
            </DialogDescription>
          </DialogHeader>
          <PosNumpad
            value={
              pinModal?.mode === "setup" && pinModal.step === "admin"
                ? adminAuthPin
                : pinModal?.mode === "setup" || pinModal?.mode === "config"
                  ? configPin
                  : supervisorPin
            }
            maxLength={
              pinModal?.mode === "setup" || pinModal?.mode === "unlock" ? 4 : 12
            }
            disabled={isPending}
            onChange={(next) => {
              if (pinModal?.mode === "setup" && pinModal.step === "admin") {
                setAdminAuthPin(next)
                return
              }
              if (pinModal?.mode === "setup" || pinModal?.mode === "config") {
                setConfigPin(next)
                return
              }
              setSupervisorPin(next)
            }}
          />
          {!pinCtx?.hasSupervisorPin &&
          !pinCtx?.hasCashierPin &&
          pinModal?.mode !== "setup" &&
          pinModal?.mode !== "config" ? (
            <p className="text-xs text-amber-600 dark:text-amber-200">
              No hay PIN cargado. Configuralo en Usuarios y PIN de caja o
              usa este modal si sos administrador.
            </p>
          ) : null}
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
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
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
                void printUrlViaHiddenIframe(`/dashboard/pos/z/${zReport.shiftId}`)
              }}
            >
              <Printer className="size-4" />
              Reimprimir Ticket Z
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={reprintModal} onOpenChange={setReprintModal}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reimprimir tickets del turno</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Ultimos 10 tickets emitidos en la caja abierta.
            </DialogDescription>
          </DialogHeader>
          {reprintRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay tickets para reimprimir en este turno.
            </p>
          ) : (
            <ul className="space-y-2">
              {reprintRows.map((row) => (
                <li
                  key={row.orderId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {row.tierName ?? "Entrada"} · {row.ticketCount} QR
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.holderName ?? "Consumidor Final"} ·{" "}
                      {formatCurrency(row.totalAmount)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shrink-0 rounded-xl"
                    onClick={() => printReprintRow(row)}
                  >
                    <Printer className="size-4" />
                    Imprimir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <PosTicketHandoffDialog
        open={handoffTickets.length > 0}
        eventTitle={selectedEvent?.title ?? "Evento TokePass"}
        tickets={handoffTickets}
        initialPhone={phone}
        onClose={() => setHandoffTickets([])}
      />

      <PosThermalReceiptStack receipts={printReceipts} />
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
