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
    case "card_pos":
      return "POS Posnet / tarjeta"
    case "mercadopago":
      return "Mercado Pago"
    case "test_sandbox":
      return "Compra de prueba"
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
      label: "Total cobrado",
      value: formatCurrency(totals.gross),
      helper: `${totals.paidCount} compras pagadas con estos filtros`,
      icon: CircleDollarSign,
      accent: "text-foreground",
      wrap: "bg-muted ring-border",
    },
    {
      label: "Comisión de la ticketera",
      value: formatCurrency(totals.platformFee),
      helper: "Lo que se queda Tokepass con estos filtros",
      icon: Sparkles,
      accent: "text-emerald-700 dark:text-emerald-300",
      wrap: "bg-emerald-500/15 ring-emerald-500/25",
      featured: true,
    },
    {
      label: "A liquidar a productoras",
      value: formatCurrency(totals.organizerNet),
      helper: "Plata que les corresponde a las productoras",
      icon: Wallet,
      accent: "text-muted-foreground",
      wrap: "bg-muted ring-border",
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
                  ? "border-border bg-gradient-to-br from-emerald-500/15 via-card to-card py-0 ring-1 ring-emerald-500/30"
                  : "border-border bg-card py-0 text-card-foreground"
              }
            >
              <CardContent className="px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </p>
                    <p className={`mt-3 text-3xl font-black tracking-tight ${accent}`}>
                      {value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
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

      <Card className="border-border bg-card py-0 text-card-foreground">
        <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <Filter className="size-4 text-sky-600 dark:text-sky-400" />
            Filtros del listado
          </CardTitle>
          <form
            method="get"
            className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1.2fr_0.9fr_auto]"
          >
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Productora
              </span>
              <select
                name="organizerId"
                defaultValue={filters.organizerId}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-sky-500/40"
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Evento
              </span>
              <select
                name="eventId"
                defaultValue={filters.eventId}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-sky-500/40"
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Estado de pago
              </span>
              <select
                name="status"
                defaultValue={filters.status || "all"}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-sky-500/40"
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
                className="h-10 rounded-xl border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="bg-muted/50 pl-6 text-muted-foreground">
                      ID / MP Payment
                    </TableHead>
                    <TableHead className="bg-muted/50 text-muted-foreground">
                      Productora / Evento
                    </TableHead>
                    <TableHead className="bg-muted/50 text-right text-muted-foreground">
                      Monto bruto
                    </TableHead>
                    <TableHead className="bg-muted/50 text-right text-muted-foreground">
                      Comisión de la ticketera
                    </TableHead>
                    <TableHead className="bg-muted/50 text-right text-muted-foreground">
                      Neto productora
                    </TableHead>
                    <TableHead className="bg-muted/50 pr-6 text-right text-muted-foreground">
                      Estado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => (
                    <TableRow
                      key={order.orderId}
                      className="border-border hover:bg-muted/50"
                    >
                      <TableCell className="py-4 pl-6 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-xs text-foreground">
                            #{order.orderId.slice(0, 8)}
                          </p>
                          {order.paymentMethod === "test_sandbox" ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-100">
                              TEST
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {order.mpPaymentId
                            ? `MP ${order.mpPaymentId}`
                            : "Sin MP ID"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDateTime(order.createdAt)} ·{" "}
                          {paymentMethodLabel(order.paymentMethod)}
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="truncate font-medium text-foreground">
                          {order.organizerName}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {order.eventTitle}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {order.buyerName}
                          {order.buyerEmail ? ` · ${order.buyerEmail}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top font-mono font-semibold text-foreground">
                        {formatCurrency(order.grossAmount)}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <p className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(order.platformFeeAmount)}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-violet-700 dark:text-violet-300">
                          {formatPercent(order.feeRate * 100, 2)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top font-mono text-muted-foreground">
                        {formatCurrency(order.organizerNetAmount)}
                      </TableCell>
                      <TableCell className="pr-6 text-right align-top">
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="grid gap-3 border-t border-border bg-muted/50 px-5 py-4 sm:grid-cols-3 sm:px-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Total cobrado
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-foreground">
                    {formatCurrency(totals.gross)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Comisión de la ticketera
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(totals.platformFee)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    A liquidar
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-muted-foreground">
                    {formatCurrency(totals.organizerNet)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Receipt className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-muted-foreground">
                  No hay compras para el filtro seleccionado.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
