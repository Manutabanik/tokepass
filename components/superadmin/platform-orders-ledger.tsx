import Link from "next/link"
import {
  CircleDollarSign,
  Filter,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react"

import type {
  PlatformLedgerFilterOption,
  PlatformLedgerOrder,
  PlatformLedgerTotals,
} from "@/app/actions/superadmin"
import { OrderStatusBadge } from "@/components/superadmin/badges"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "@/lib/format"
import type { OrderStatus } from "@/types/database"

const STATUS_OPTIONS: Array<{ value: "all" | OrderStatus; label: string }> = [
  { value: "all", label: "Todos los estados" },
  { value: "paid", label: "Pagada" },
  { value: "pending", label: "Pendiente" },
  { value: "failed", label: "Fallida" },
  { value: "expired", label: "Expirada" },
  { value: "refunded", label: "Reembolsada" },
]

function paymentMethodLabel(method: string): string {
  switch (method) {
    case "cash_pos":
      return "POS efectivo"
    case "transfer_pos":
      return "POS transferencia"
    case "mercadopago":
      return "Mercado Pago"
    default:
      return method
  }
}

export function PlatformOrdersLedger({
  rows,
  totals,
  organizers,
  events,
  filters,
}: {
  rows: PlatformLedgerOrder[]
  totals: PlatformLedgerTotals
  organizers: PlatformLedgerFilterOption[]
  events: PlatformLedgerFilterOption[]
  filters: {
    organizerId: string
    eventId: string
    status: string
  }
}) {
  const kpis = [
    {
      label: "Total Bruto",
      value: formatCurrency(totals.gross),
      helper: `${totals.paidCount} órdenes pagadas en filtro`,
      icon: CircleDollarSign,
      accent: "text-white",
      wrap: "bg-white/[0.04] ring-white/10",
    },
    {
      label: "Comisión Tokepass",
      value: formatCurrency(totals.platformFee),
      helper: "Tu ganancia del filtro activo",
      icon: Sparkles,
      accent: "text-emerald-300",
      wrap: "bg-emerald-500/10 ring-emerald-400/25",
      featured: true,
    },
    {
      label: "Total a Liquidar",
      value: formatCurrency(totals.organizerNet),
      helper: "Neto acumulado a productoras",
      icon: Wallet,
      accent: "text-zinc-300",
      wrap: "bg-zinc-500/10 ring-zinc-400/20",
    },
  ] as const

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {kpis.map(({ label, value, helper, icon: Icon, accent, wrap, ...rest }) => {
          const featured = "featured" in rest && rest.featured
          return (
            <Card
              key={label}
              className={
                featured
                  ? "border-0 bg-gradient-to-br from-emerald-500/15 via-white/[0.04] to-white/[0.02] py-0 ring-1 ring-emerald-400/30"
                  : "border-0 bg-white/[0.035] py-0 ring-1 ring-white/8"
              }
            >
              <CardContent className="px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                      {label}
                    </p>
                    <p className={`mt-3 text-3xl font-black tracking-tight ${accent}`}>
                      {value}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{helper}</p>
                  </div>
                  <span
                    className={`grid size-10 place-items-center rounded-xl ring-1 ring-inset ${wrap}`}
                  >
                    <Icon className={`size-5 ${accent}`} aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Filter className="size-4 text-sky-400" />
            Filtros del ledger
          </CardTitle>
          <form
            method="get"
            className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1.2fr_0.9fr_auto]"
          >
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                Productora
              </span>
              <select
                name="organizerId"
                defaultValue={filters.organizerId}
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 outline-none focus:border-sky-400/40"
              >
                <option value="">Todas las productoras</option>
                {organizers.map((organizer) => (
                  <option key={organizer.id} value={organizer.id}>
                    {organizer.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                Evento
              </span>
              <select
                name="eventId"
                defaultValue={filters.eventId}
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 outline-none focus:border-sky-400/40"
              >
                <option value="">Todos los eventos</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                Estado de pago
              </span>
              <select
                name="status"
                defaultValue={filters.status || "all"}
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 outline-none focus:border-sky-400/40"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <Button
                type="submit"
                className="h-10 rounded-xl bg-sky-600 px-4 text-white hover:bg-sky-500"
              >
                Aplicar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-white/10 bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                nativeButton={false}
                render={<Link href="/superadmin/orders" />}
              >
                Limpiar
              </Button>
            </div>
          </form>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {rows.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="pl-6 text-zinc-600">
                      ID / MP Payment
                    </TableHead>
                    <TableHead className="text-zinc-600">
                      Productora / Evento
                    </TableHead>
                    <TableHead className="text-right text-zinc-600">
                      Monto bruto
                    </TableHead>
                    <TableHead className="text-right text-zinc-600">
                      Comisión Tokepass
                    </TableHead>
                    <TableHead className="text-right text-zinc-600">
                      Neto productora
                    </TableHead>
                    <TableHead className="pr-6 text-right text-zinc-600">
                      Estado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => (
                    <TableRow
                      key={order.orderId}
                      className="border-white/8 hover:bg-white/[0.025]"
                    >
                      <TableCell className="py-4 pl-6 align-top">
                        <p className="font-mono text-xs text-zinc-300">
                          #{order.orderId.slice(0, 8)}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-zinc-600">
                          {order.mpPaymentId
                            ? `MP ${order.mpPaymentId}`
                            : "Sin MP ID"}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-700">
                          {formatDateTime(order.createdAt)} ·{" "}
                          {paymentMethodLabel(order.paymentMethod)}
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="truncate font-medium text-zinc-200">
                          {order.organizerName}
                        </p>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {order.eventTitle}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-zinc-700">
                          {order.buyerName}
                          {order.buyerEmail ? ` · ${order.buyerEmail}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top font-mono font-semibold text-white">
                        {formatCurrency(order.grossAmount)}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <p className="font-mono font-bold text-emerald-300">
                          {formatCurrency(order.platformFeeAmount)}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-violet-300">
                          {formatPercent(order.feeRate * 100, 2)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top font-mono text-zinc-400">
                        {formatCurrency(order.organizerNetAmount)}
                      </TableCell>
                      <TableCell className="pr-6 text-right align-top">
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="grid gap-3 border-t border-white/8 bg-black/20 px-5 py-4 sm:grid-cols-3 sm:px-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                    Pie · Total bruto
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-white">
                    {formatCurrency(totals.gross)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                    Pie · Comisión Tokepass
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-300">
                    {formatCurrency(totals.platformFee)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                    Pie · Total a liquidar
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-zinc-300">
                    {formatCurrency(totals.organizerNet)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <Receipt className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-zinc-500">
                  No hay órdenes para el filtro seleccionado.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
