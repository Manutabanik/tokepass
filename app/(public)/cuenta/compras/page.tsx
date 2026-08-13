import { Receipt, ShoppingBag } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  getMyOrders,
} from "@/app/actions/buyer-orders"
import { buyerPaymentMethodLabel } from "@/lib/buyer-payment-label"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import type { OrderStatus } from "@/types/database"

export const metadata: Metadata = {
  title: "Mis compras",
  description: "Historial de órdenes y comprobantes Tokepass.",
}

function statusLabel(status: OrderStatus): { text: string; className: string } {
  switch (status) {
    case "paid":
      return {
        text: "Pagada",
        className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
      }
    case "refunded":
      return {
        text: "Reembolsada",
        className: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
      }
    case "failed":
    case "expired":
      return {
        text: status === "failed" ? "Fallida" : "Expirada",
        className: "bg-red-500/15 text-red-300 ring-red-500/30",
      }
    case "pending":
      return {
        text: "Pendiente",
        className: "bg-zinc-500/20 text-zinc-300 ring-zinc-500/30",
      }
    default:
      return {
        text: status,
        className: "bg-zinc-500/20 text-zinc-300 ring-zinc-500/30",
      }
  }
}

export default async function CuentaComprasPage() {
  let orders: Awaited<ReturnType<typeof getMyOrders>> = []
  try {
    orders = await getMyOrders()
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/cuenta/compras")
    }
    throw error
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300/90">
          Compras
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Mis compras
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Historial de órdenes, medios de pago y comprobantes.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-14 text-center">
          <Receipt className="mx-auto size-8 text-zinc-600" />
          <h2 className="mt-4 text-lg font-bold text-white">
            Todavía no hay compras
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            Cuando compres entradas o extras, aparecen acá.
          </p>
          <Button
            className="mt-6 min-h-12 rounded-xl"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Explorar eventos
          </Button>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const status = statusLabel(order.status)
            const ticketsSubtotal = Math.max(
              0,
              order.subtotal - order.extrasTotal,
            )
            return (
              <li
                key={order.id}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-zinc-500">
                      Orden {order.id.slice(0, 8).toUpperCase()}
                      {order.mpPaymentId
                        ? ` · MP ${order.mpPaymentId}`
                        : ""}
                    </p>
                    <h2 className="mt-1 truncate text-lg font-bold text-white">
                      {order.eventTitle ?? "Compra Tokepass"}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatEventDay(order.createdAt)} ·{" "}
                      {formatEventTime(order.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${status.className}`}
                  >
                    {status.text}
                  </span>
                </div>

                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3 text-zinc-400">
                    <dt>
                      Entradas
                      {order.ticketCount
                        ? ` (${order.ticketCount})`
                        : ""}
                    </dt>
                    <dd className="tabular-nums text-zinc-200">
                      {formatCurrency(ticketsSubtotal)}
                    </dd>
                  </div>
                  {order.extrasCount > 0 ? (
                    <div className="flex justify-between gap-3 text-zinc-400">
                      <dt>Extras ({order.extrasCount})</dt>
                      <dd className="tabular-nums text-zinc-200">
                        {formatCurrency(order.extrasTotal)}
                      </dd>
                    </div>
                  ) : null}
                  {order.serviceCharge > 0 ? (
                    <div className="flex justify-between gap-3 text-zinc-400">
                      <dt>Fee de servicio</dt>
                      <dd className="tabular-nums text-zinc-200">
                        {formatCurrency(order.serviceCharge)}
                      </dd>
                    </div>
                  ) : null}
                  {order.discountAmount > 0 ? (
                    <div className="flex justify-between gap-3 text-zinc-400">
                      <dt>Descuento</dt>
                      <dd className="tabular-nums text-emerald-300">
                        −{formatCurrency(order.discountAmount)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 border-t border-white/8 pt-2 font-semibold text-white">
                    <dt>Total pagado</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(order.totalAmount)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-zinc-500">
                  Medio de pago: {buyerPaymentMethodLabel(order.paymentMethod)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {order.firstTicketId ? (
                    <Button
                      variant="outline"
                      className="min-h-12 flex-1 rounded-xl border-white/15"
                      nativeButton={false}
                      render={
                        <Link
                          href={`/tickets/${order.firstTicketId}/print`}
                          target="_blank"
                        />
                      }
                    >
                      Ver comprobante
                    </Button>
                  ) : null}
                  <Button
                    className="min-h-12 flex-1 rounded-xl"
                    nativeButton={false}
                    render={
                      <Link
                        href={
                          order.firstTicketId
                            ? `/cuenta/entradas/${order.firstTicketId}`
                            : "/cuenta/entradas"
                        }
                      />
                    }
                  >
                    Ver entradas de esta compra
                  </Button>
                  {order.eventId ? (
                    <Button
                      variant="outline"
                      className="min-h-12 rounded-xl border-white/15"
                      nativeButton={false}
                      render={<Link href={`/events/${order.eventId}`} />}
                    >
                      <ShoppingBag className="size-4" />
                      Ver evento
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
