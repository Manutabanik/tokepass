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
  description: "Historial de órdenes y comprobantes TokePass.",
}

function statusLabel(status: OrderStatus): { text: string; className: string } {
  switch (status) {
    case "paid":
      return {
        text: "Pagada",
        className:
          "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-300",
      }
    case "refunded":
      return {
        text: "Reembolsada",
        className:
          "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-200",
      }
    case "refund_processing":
      return {
        text: "Devolución en proceso",
        className:
          "bg-sky-500/15 text-sky-800 ring-sky-500/30 dark:text-sky-200",
      }
    case "failed":
    case "expired":
      return {
        text: status === "failed" ? "Fallida" : "Expirada",
        className:
          "bg-rose-500/15 text-rose-800 ring-rose-500/30 dark:text-rose-300",
      }
    case "pending":
      return {
        text: "Pendiente",
        className:
          "bg-muted text-muted-foreground ring-border",
      }
    default:
      return {
        text: status,
        className:
          "bg-muted text-muted-foreground ring-border",
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
    <section className="space-y-6">
      <header>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300/90">
          Compras
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Mis compras
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Historial de órdenes, medios de pago y comprobantes.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
          <Receipt className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-bold text-foreground">
            Todavía no hay compras
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cuando compres entradas o extras, aparecen acá.
          </p>
          <Button
            className="mt-6 min-h-12 rounded-xl bg-emerald-500 font-semibold text-black hover:bg-emerald-600"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Explorar
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {orders.map((order) => {
            const status = statusLabel(order.status)
            const ticketsSubtotal = Math.max(
              0,
              order.subtotal - order.extrasTotal,
            )
            return (
              <li
                key={order.id}
                className="rounded-3xl border border-border bg-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Orden {order.id.slice(0, 8).toUpperCase()}
                      {order.mpPaymentId
                        ? ` · MP ${order.mpPaymentId}`
                        : ""}
                    </p>
                    <h2 className="mt-1 truncate text-lg font-bold text-foreground">
                      {order.eventTitle ?? "Compra TokePass"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatEventDay(order.createdAt)} ·{" "}
                      {formatEventTime(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.paymentMethod === "test_sandbox" ? (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-100">
                        TEST
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${status.className}`}
                    >
                      {status.text}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <dt>
                      Entradas
                      {order.ticketCount
                        ? ` (${order.ticketCount})`
                        : ""}
                    </dt>
                    <dd className="tabular-nums text-foreground">
                      {formatCurrency(ticketsSubtotal)}
                    </dd>
                  </div>
                  {order.extrasCount > 0 ? (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <dt>Extras ({order.extrasCount})</dt>
                      <dd className="tabular-nums text-foreground">
                        {formatCurrency(order.extrasTotal)}
                      </dd>
                    </div>
                  ) : null}
                  {order.serviceCharge > 0 ? (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <dt>Fee de servicio</dt>
                      <dd className="tabular-nums text-foreground">
                        {formatCurrency(order.serviceCharge)}
                      </dd>
                    </div>
                  ) : null}
                  {order.discountAmount > 0 ? (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <dt>Descuento</dt>
                      <dd className="tabular-nums text-emerald-700 dark:text-emerald-300">
                        −{formatCurrency(order.discountAmount)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold text-foreground">
                    <dt>Total pagado</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(order.totalAmount)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-muted-foreground">
                  Medio de pago: {buyerPaymentMethodLabel(order.paymentMethod)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {order.status === "pending" ? (
                    <Button
                      className="min-h-12 flex-1 rounded-xl bg-[#009EE3] font-semibold text-white hover:bg-[#08A8EE]"
                      nativeButton={false}
                      render={<Link href={`/cuenta/compras/${order.id}`} />}
                    >
                      Continuar pago
                    </Button>
                  ) : null}
                  {order.firstTicketId ? (
                    <Button
                      variant="outline"
                      className="min-h-12 flex-1 rounded-xl border-border"
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
                    className="min-h-12 flex-1 rounded-xl bg-emerald-500 font-semibold text-black hover:bg-emerald-600"
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
                      className="min-h-12 rounded-xl border-border"
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
