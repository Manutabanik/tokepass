"use client"

import {
  Banknote,
  Ban,
  CreditCard,
  Gift,
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
import { useEffect, useMemo, useState, useTransition } from "react"
import { QRCodeSVG } from "qrcode.react"
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
  type PosSaleResult,
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
import {
  printTicketsViaHiddenIframe,
  printUrlViaHiddenIframe,
} from "@/lib/pos-thermal-print"
import { cn } from "@/lib/utils"

type PayMethod = "cash_pos" | "transfer_pos" | "card_pos"

const LAST_TICKETS_KEY = "tokepass.pos.lastTicketIds"

export function PosTerminal({ events }: { events: PosEventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "")
  const [tierId, setTierId] = useState(events[0]?.tiers[0]?.id ?? "")
  const [quantity, setQuantity] = useState(1)
  const [phone, setPhone] = useState("")
  const [dni, setDni] = useState("")
  const [buyerName, setBuyerName] = useState("")
  const [shift, setShift] = useState<CashierShiftRow | null>(null)
  const [shiftLoading, setShiftLoading] = useState(true)
  const [openCashAmount, setOpenCashAmount] = useState("0")
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [countedAmount, setCountedAmount] = useState("")
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Extract<
    PosSaleResult,
    { success: true }
  > | null>(null)
  const [lastTicketIds, setLastTicketIds] = useState<string[]>([])
  const [pinModal, setPinModal] = useState<{
    mode: "courtesy" | "void" | "config"
    method?: PayMethod
    orderId?: string
  } | null>(null)
  const [supervisorPin, setSupervisorPin] = useState("")
  const [configPin, setConfigPin] = useState("")
  const [voidOrders, setVoidOrders] = useState<PosShiftOrder[]>([])
  const [voidModal, setVoidModal] = useState(false)
  const [zReport, setZReport] = useState<TicketZReport | null>(null)

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [events, eventId],
  )

  const selectedTier = selectedEvent?.tiers ?? []
  const selectedTierId =
    selectedTier.find((tier) => tier.id === tierId)?.id ??
    selectedTier[0]?.id ??
    ""
  const selectedTierItem =
    selectedTier.find((tier) => tier.id === selectedTierId) ?? null
  const total = selectedTierItem ? selectedTierItem.price * quantity : 0
  const needsPin = Boolean(selectedTierItem?.requiresSupervisorPin)

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
    const next = events.find((event) => event.id === nextEventId)
    setTierId(next?.tiers[0]?.id ?? "")
    setQuantity(1)
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

  function requestSell(method: PayMethod) {
    if (!eventId || !selectedTierId || !shift || isPending) return
    const cleanDni = dni.replace(/\D/g, "")
    if (cleanDni.length < 7) {
      toast.error("Ingresá el DNI del comprador")
      return
    }
    if (needsPin) {
      setSupervisorPin("")
      setPinModal({ mode: "courtesy", method })
      return
    }
    runSale(method, null)
  }

  function runSale(method: PayMethod, pin: string | null) {
    if (!eventId || !selectedTierId || !shift) return
    const cleanDni = dni.replace(/\D/g, "")

    startTransition(async () => {
      const sale = await createPosSale({
        eventId,
        tierId: selectedTierId,
        quantity,
        paymentMethod: method,
        customerPhone: phone,
        customerDni: cleanDni,
        customerName: buyerName,
        shiftId: shift.id,
        supervisorPin: pin,
      })

      if (!sale.success) {
        toast.error(sale.error)
        if (sale.error.toLowerCase().includes("abrir la caja")) {
          setOpenModal(true)
        }
        return
      }

      const labels: Record<PayMethod, string> = {
        cash_pos: "Cobrado en efectivo",
        card_pos: "Cobrado con Posnet / tarjeta",
        transfer_pos: "Cobrado por transferencia",
      }
      toast.success(
        needsPin || sale.totalAmount === 0
          ? "Cortesía emitida"
          : labels[method],
      )
      setResult(sale)
      setPinModal(null)
      setSupervisorPin("")
      setQuantity(1)
      setPhone("")
      setDni("")
      setBuyerName("")
      const ids = sale.tickets.map((t) => t.id)
      persistLastTickets(ids)
      void printTicketsViaHiddenIframe(ids).catch(() => {
        toast.message("Usá Reimprimir si el papel se trabó.")
      })
      const next = await getOpenCashierShift(eventId)
      if (next) setShift(next)
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

    if (pinModal.mode === "courtesy" && pinModal.method) {
      runSale(pinModal.method, supervisorPin.trim())
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

  if (events.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950/60">
        <Ticket className="mx-auto size-8 text-zinc-600" />
        <p className="mt-3 text-sm text-zinc-500">
          No hay eventos disponibles para cobrar en puerta.
        </p>
      </div>
    )
  }

  const cashExpected =
    (shift?.startAmount ?? 0) + (shift?.cashSalesTotal ?? 0)

  return (
    <div className="mx-auto w-full max-w-md space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {shift ? (
        <div className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-300">
                <Unlock className="size-3.5" />
                Caja abierta
              </p>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 rounded-xl"
              disabled={isPending || lastTicketIds.length === 0}
              onClick={handleReprint}
            >
              <Printer className="size-4" />
              Reimprimir
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 rounded-xl border-red-500/40 text-red-200"
              disabled={isPending}
              onClick={openVoidList}
            >
              <Ban className="size-4" />
              Anular Venta
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
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {shiftLoading
            ? "Revisando turno…"
            : "Abrí la caja para empezar a cobrar."}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-zinc-600 dark:text-zinc-400">Evento</Label>
        <Select value={eventId} onValueChange={(v) => v && onEventChange(v)}>
          <SelectTrigger className="h-14 rounded-2xl border-zinc-200 bg-white text-base text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
            <SelectValue placeholder="Elegí evento" />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset
        disabled={!shift || isPending}
        className="space-y-4 disabled:opacity-50"
      >
        <div className="space-y-2">
          <Label className="text-zinc-600 dark:text-zinc-400">
            Tipo de entrada
          </Label>
          <Select
            value={selectedTierId}
            onValueChange={(v) => v && setTierId(v)}
          >
            <SelectTrigger className="h-14 rounded-2xl border-zinc-200 bg-white text-base text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
              <SelectValue placeholder="Elegí tipo" />
            </SelectTrigger>
            <SelectContent>
              {selectedTier.map((tier) => (
                <SelectItem key={tier.id} value={tier.id}>
                  {tier.name}
                  {tier.admitCount > 1 ? ` · Mesa x${tier.admitCount}` : ""}
                  {tier.requiresSupervisorPin
                    ? " · Cortesía (PIN)"
                    : ` · ${formatCurrency(tier.price)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTierItem ? (
            <p className="text-xs text-zinc-500">
              {selectedTierItem.available} disponibles
              {selectedTierItem.requiresSupervisorPin
                ? " · Requiere PIN de Autorización"
                : ""}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Cantidad
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-12 rounded-full border-zinc-300 dark:border-zinc-700"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus />
            </Button>
            <span className="w-8 text-center text-2xl font-black tabular-nums text-zinc-900 dark:text-white">
              {quantity}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-12 rounded-full border-zinc-300 dark:border-zinc-700"
              disabled={
                !selectedTierItem ||
                quantity >= Math.min(10, selectedTierItem.available)
              }
              onClick={() =>
                setQuantity((q) =>
                  Math.min(10, selectedTierItem?.available ?? 10, q + 1),
                )
              }
            >
              <Plus />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pos-dni" className="text-zinc-600 dark:text-zinc-400">
            DNI del comprador <span className="text-red-400">*</span>
          </Label>
          <Input
            id="pos-dni"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Solo números"
            value={dni}
            onChange={(e) =>
              setDni(e.target.value.replace(/\D/g, "").slice(0, 11))
            }
            className="h-14 rounded-2xl border-zinc-200 bg-white text-base text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pos-name" className="text-zinc-600 dark:text-zinc-400">
            Nombre (opcional)
          </Label>
          <Input
            id="pos-name"
            autoComplete="name"
            placeholder="Ej. Juan Pérez"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            className="h-14 rounded-2xl border-zinc-200 bg-white text-base text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="pos-phone"
            className="text-zinc-600 dark:text-zinc-400"
          >
            Teléfono / WhatsApp (opcional)
          </Label>
          <Input
            id="pos-phone"
            inputMode="tel"
            placeholder="+54 9 11 ..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-14 rounded-2xl border-zinc-200 bg-white text-base text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
          />
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Total</span>
            <span className="text-3xl font-black tabular-nums text-zinc-900 dark:text-white">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="grid gap-3">
          {needsPin ? (
            <Button
              type="button"
              disabled={!selectedTierItem}
              onClick={() => requestSell("cash_pos")}
              className="h-16 rounded-2xl border border-amber-500/40 bg-amber-500/15 text-lg font-bold text-amber-100 hover:bg-amber-500/25"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Gift className="size-6" />
              )}
              Emitir cortesía (PIN)
            </Button>
          ) : (
            <>
              <Button
                type="button"
                disabled={!selectedTierItem || total <= 0}
                onClick={() => requestSell("cash_pos")}
                className="h-16 rounded-2xl bg-emerald-500 text-lg font-bold text-zinc-950 hover:bg-emerald-400"
              >
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Banknote className="size-6" />
                )}
                Cobrar en efectivo
              </Button>
              <Button
                type="button"
                disabled={!selectedTierItem || total <= 0}
                onClick={() => requestSell("card_pos")}
                className="h-16 rounded-2xl border border-violet-500/40 bg-violet-500/15 text-lg font-bold text-violet-100 hover:bg-violet-500/25"
              >
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CreditCard className="size-6" />
                )}
                Cobrar con Posnet / tarjeta
              </Button>
              <Button
                type="button"
                disabled={!selectedTierItem || total <= 0}
                onClick={() => requestSell("transfer_pos")}
                className="h-16 rounded-2xl border border-sky-500/40 bg-sky-500/15 text-lg font-bold text-sky-100 hover:bg-sky-500/25"
              >
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Smartphone className="size-6" />
                )}
                Cobrar por transferencia
              </Button>
            </>
          )}
        </div>
      </fieldset>

      <Dialog
        open={openModal && !shift}
        onOpenChange={(open) => {
          if (!open && !shift) return
          setOpenModal(open)
        }}
      >
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
            <DialogDescription className="text-zinc-500">
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
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar Turno (Ticket Z)</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Se imprime el resumen 80mm al confirmar.
            </DialogDescription>
          </DialogHeader>
          {shift ? (
            <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
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
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
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
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pinModal?.mode === "config"
                ? "Configurar PIN de Autorización"
                : pinModal?.mode === "void"
                  ? "Anular Venta"
                  : "Requiere PIN de Supervisor"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
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
              <p className="text-xs text-amber-600 dark:text-amber-300">
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular Venta</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Solo ventas del turno abierto. Pedirá PIN de Autorización.
            </DialogDescription>
          </DialogHeader>
          {voidOrders.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay ventas para anular.</p>
          ) : (
            <ul className="space-y-2">
              {voidOrders.map((order) => (
                <li
                  key={order.orderId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-3 dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {order.tierName ?? "Entrada"} · {order.ticketCount} QR
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {order.holderName ?? "—"}
                      {order.holderDni ? ` · DNI ${order.holderDni}` : ""} ·{" "}
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shrink-0 rounded-xl border-red-500/40 text-red-600"
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
        open={!!result}
        onOpenChange={(open) => {
          if (!open) setResult(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Venta registrada</DialogTitle>
            <DialogDescription className="text-zinc-600 dark:text-zinc-400">
              Impresión térmica enviada automáticamente.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Total:{" "}
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {formatCurrency(result.totalAmount)}
                </span>
              </p>
              {result.tickets.map((ticket, index) => (
                <div
                  key={ticket.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-center dark:border-zinc-800 dark:bg-black/40"
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Entrada {index + 1}
                  </p>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {ticket.holderName} · DNI {ticket.holderDni}
                  </p>
                  <div className="mx-auto mt-3 inline-block rounded-xl bg-white p-3">
                    <QRCodeSVG
                      value={ticket.totpSecret}
                      size={220}
                      level="H"
                      includeMargin
                      bgColor="#ffffff"
                      fgColor="#09090b"
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-full"
                onClick={handleReprint}
              >
                <Printer className="size-4" />
                Reimprimir
              </Button>
              <Button
                type="button"
                className="h-12 w-full rounded-full"
                onClick={() => setResult(null)}
              >
                Nueva venta
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!zReport}
        onOpenChange={(open) => {
          if (!open) setZReport(null)
        }}
      >
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
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
                void printUrlViaHiddenIframe(
                  `/admin/pos/z/${zReport.shiftId}`,
                )
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
      <span className="text-zinc-500">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong
            ? "text-base font-black text-emerald-600 dark:text-emerald-300"
            : "font-semibold text-zinc-900 dark:text-white",
        )}
      >
        {value}
      </span>
    </div>
  )
}
