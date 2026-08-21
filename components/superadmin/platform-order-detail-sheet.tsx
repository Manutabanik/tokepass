"use client"

import { Ban, LoaderCircle, Mail, Receipt } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import type { PlatformLedgerOrder } from "@/app/actions/superadmin"
import {
  getPlatformOrderDetail,
  resendPlatformOrderTickets,
  voidPlatformOrder,
  type PlatformOrderDetail,
} from "@/app/actions/superadmin-orders"
import { OrderStatusBadge } from "@/components/superadmin/badges"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatCurrency, formatPercent } from "@/lib/format"
import type { TicketStatus } from "@/types/database"

function ticketStatusLabel(status: TicketStatus) {
  switch (status) {
    case "valid":
      return "Activa"
    case "used":
    case "scanned":
      return "Usada"
    case "cancelled":
    case "revoked":
      return "Inactiva"
    case "transferred":
      return "Transferida"
    case "pending_payment":
      return "Pendiente"
    default:
      return status
  }
}

function supportStatusLabel(status: PlatformLedgerOrder["status"]) {
  if (status === "refunded" || status === "refund_processing") return "Anulada"
  if (status === "paid") return "Pagada"
  return null
}

type PlatformOrderDetailSheetProps = {
  order: PlatformLedgerOrder | null
  onClose: () => void
  onVoided: (orderId: string) => void
}

export function PlatformOrderDetailSheet(props: PlatformOrderDetailSheetProps) {
  return (
    <PlatformOrderDetailSheetBody
      key={props.order?.orderId ?? "closed"}
      {...props}
    />
  )
}

function PlatformOrderDetailSheetBody({
  order,
  onClose,
  onVoided,
}: PlatformOrderDetailSheetProps) {
  const [detail, setDetail] = useState<PlatformOrderDetail | null>(null)
  const [loading, startLoad] = useTransition()
  const [acting, startAction] = useTransition()
  const [confirmVoid, setConfirmVoid] = useState(false)

  useEffect(() => {
    if (!order) return
    startLoad(async () => {
      const result = await getPlatformOrderDetail(order.orderId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setDetail(result.data)
    })
  }, [order])

  const currentStatus = detail?.status ?? order?.status
  const canResend = currentStatus === "paid"
  const canVoid = currentStatus === "paid" || currentStatus === "refund_processing"
  const buyerName = detail?.buyerName || order?.buyerName || "Comprador"
  const buyerEmail = detail?.buyerEmail || order?.buyerEmail || "Sin email"
  const buyerDni = detail?.buyerDni?.trim() || "Sin DNI"

  function handleResend() {
    if (!order) return
    startAction(async () => {
      const result = await resendPlatformOrderTickets(order.orderId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.sent === 1
          ? "Se reenvió 1 entrada al comprador."
          : `Se reenviaron ${result.sent} entradas al comprador.`,
      )
    })
  }

  function handleVoid() {
    if (!order) return
    startAction(async () => {
      const result = await voidPlatformOrder(order.orderId)
      setConfirmVoid(false)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Compra anulada. Las entradas quedaron invalidadas.")
      setDetail((current) =>
        current
          ? {
              ...current,
              status: "refunded",
              tickets: current.tickets.map((ticket) =>
                ticket.status === "valid" || ticket.status === "pending_payment"
                  ? { ...ticket, status: "cancelled" }
                  : ticket,
              ),
            }
          : current,
      )
      onVoided(order.orderId)
    })
  }

  return (
    <>
      <Sheet
        open={Boolean(order)}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full max-w-lg flex-col gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground"
        >
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <Receipt className="size-5 text-sky-600 dark:text-sky-300" />
              Detalle de la compra
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Reclamos de soporte: reenviar entradas o anular la compra.
            </SheetDescription>
            {order ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="font-mono text-xs text-foreground">
                  #{order.orderId.slice(0, 8)}
                </p>
                {currentStatus ? (
                  <OrderStatusBadge status={currentStatus} />
                ) : null}
                {currentStatus && supportStatusLabel(currentStatus) ? (
                  <span className="text-xs text-muted-foreground">
                    {supportStatusLabel(currentStatus)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
            {!order ? null : loading && !detail ? (
              <p className="text-sm text-muted-foreground">Cargando detalle…</p>
            ) : (
              <div className="space-y-5">
                <section className="rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Comprador
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {buyerName}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {buyerEmail}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    DNI {buyerDni}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Desglose financiero
                  </p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Monto bruto</dt>
                      <dd className="font-mono font-semibold text-foreground">
                        {formatCurrency(order.grossAmount)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">
                        Comisión ({formatPercent(order.feeRate * 100, 2)})
                      </dt>
                      <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(order.platformFeeAmount)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Neto productora</dt>
                      <dd className="font-mono text-foreground">
                        {formatCurrency(order.organizerNetAmount)}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Entradas generadas
                  </p>
                  {detail && detail.tickets.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {detail.tickets.map((ticket) => (
                        <li
                          key={ticket.id}
                          className="rounded-xl border border-border bg-card px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-mono text-xs font-semibold text-foreground">
                              {ticket.code}
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              {ticketStatusLabel(ticket.status)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {ticket.holderName || "Sin titular"}
                            {ticket.holderEmail ? ` · ${ticket.holderEmail}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Esta compra no tiene entradas asociadas.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>

          <SheetFooter className="gap-2 border-t border-border bg-card px-5 py-4 sm:flex-col">
            <Button
              type="button"
              disabled={!canResend || acting}
              onClick={handleResend}
              className="h-11 w-full justify-center rounded-xl"
            >
              {acting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Mail className="size-4" aria-hidden="true" />
              )}
              Reenviar Entradas
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canVoid || acting}
              onClick={() => setConfirmVoid(true)}
              className="h-11 w-full justify-center rounded-xl border-rose-500/40 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200"
            >
              <Ban className="size-4" aria-hidden="true" />
              Anular Compra
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={confirmVoid}
        onOpenChange={(open) => setConfirmVoid(Boolean(open))}
      >
        <DialogContent
          overlayClassName="z-[60]"
          className="z-[70] border-rose-500/30 bg-card text-card-foreground sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-rose-700 dark:text-rose-200">
              Anular compra
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              ¿Querés anular esta compra? Las entradas quedan invalidadas.
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={acting}
              onClick={() => setConfirmVoid(false)}
              className="rounded-xl"
            >
              Volver atrás
            </Button>
            <Button
              type="button"
              disabled={acting}
              onClick={handleVoid}
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-500"
            >
              {acting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="size-4" aria-hidden="true" />
              )}
              Anular compra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
