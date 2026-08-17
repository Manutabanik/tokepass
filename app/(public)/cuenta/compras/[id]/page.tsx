import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getMyOrderById } from "@/app/actions/buyer-orders"
import { PendingOrderPayPanel } from "@/components/public/pending-order-pay-panel"
import { Button } from "@/components/ui/button"
import { buyerPaymentMethodLabel } from "@/lib/buyer-payment-label"
import { resolveOrderHoldExpiresAt } from "@/lib/checkout-hold"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"

export const metadata: Metadata = {
  title: "Detalle de la compra",
  description: "Estado de tu orden y reintento de pago Tokepass.",
}

export default async function CuentaCompraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let order: Awaited<ReturnType<typeof getMyOrderById>> = null
  try {
    order = await getMyOrderById(id)
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect(`/login?next=/cuenta/compras/${id}`)
    }
    throw error
  }

  if (!order) notFound()

  const expiresAt = resolveOrderHoldExpiresAt(
    order.createdAt,
    order.reservedUntil,
  ).toISOString()
  const holdActive = order.status === "pending"

  return (
    <section className="space-y-6">
      <Button
        variant="ghost"
        className="-ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/cuenta/compras" />}
      >
        <ArrowLeft className="size-4" />
        Volver a compras
      </Button>

      <header>
        <p className="mb-2 font-mono text-[11px] text-muted-foreground">
          Orden {order.id.slice(0, 8).toUpperCase()}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {order.eventTitle ?? "Compra Tokepass"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatEventDay(order.createdAt)} · {formatEventTime(order.createdAt)}{" "}
          · {buyerPaymentMethodLabel(order.paymentMethod)}
        </p>
      </header>

      <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">Total</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
          {formatCurrency(order.totalAmount)}
        </p>

        {holdActive ? (
          <div className="mt-6">
            <PendingOrderPayPanel
              orderId={order.id}
              expiresAt={expiresAt}
              eventId={order.eventId}
            />
          </div>
        ) : order.status === "pending" ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Esta reserva ya no está vigente. Volvé al evento para elegir
            entradas de nuevo.
          </p>
        ) : order.status === "paid" ? (
          <p className="mt-6 text-sm text-muted-foreground">
            El pago se acreditó. Tus entradas están en Mi cuenta.
          </p>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Esta orden no admite un nuevo checkout.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {order.firstTicketId ? (
            <Button
              className="min-h-12 rounded-xl bg-emerald-500 font-semibold text-black hover:bg-emerald-600"
              nativeButton={false}
              render={<Link href={`/cuenta/entradas/${order.firstTicketId}`} />}
            >
              Ver entradas
            </Button>
          ) : null}
          {order.eventId ? (
            <Button
              variant="outline"
              className="min-h-12 rounded-xl"
              nativeButton={false}
              render={<Link href={`/events/${order.eventId}`} />}
            >
              Ver evento
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
