import type { Metadata } from "next"
import {
  Calendar,
  CalendarPlus,
  DollarSign,
  Plus,
  Sparkles,
  Ticket,
} from "lucide-react"
import Link from "next/link"

import { getDashboardMetrics } from "@/app/actions/dashboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { formatCurrency, formatDateTime } from "@/lib/format"

export const metadata: Metadata = {
  title: "Dashboard",
}

const orderStatusPresentation: Record<
  string,
  { label: string; className: string }
> = {
  paid: {
    label: "Pagada",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  pending: {
    label: "Pendiente",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  },
  failed: {
    label: "Fallida",
    className: "border-red-400/20 bg-red-400/10 text-red-300",
  },
}

export default async function AdminDashboardPage() {
  const metrics = await getDashboardMetrics()

  const kpis = [
    {
      label: "Ingresos Totales",
      value: formatCurrency(metrics.totalRevenue),
      helper:
        metrics.totalRevenue > 0
          ? "GMV acumulado de tu operación"
          : "Sin ventas registradas aún",
      icon: DollarSign,
    },
    {
      label: "Entradas Vendidas",
      value: String(metrics.ticketsSold),
      helper:
        metrics.ticketsSold > 0
          ? "Válidas + escaneadas"
          : "Todavía no emitiste tickets",
      icon: Ticket,
    },
    {
      label: "Eventos Activos",
      value: String(metrics.activeEvents),
      helper:
        metrics.activeEvents > 0
          ? "Publicados en cartelera"
          : "Publicá un evento para vender",
      icon: Calendar,
    },
  ] as const

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-400">
            <Sparkles className="size-4" aria-hidden="true" />
            Resumen ejecutivo
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
            Buen día, equipo.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Métricas reales de tu operación: ingresos, tickets y actividad
            reciente.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {kpis.map(({ label, value, helper, icon: Icon }) => (
          <Card
            key={label}
            className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8"
          >
            <CardContent className="px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500">{label}</p>
                <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/10">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-5 text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl">
                {value}
              </p>
              <p className="mt-2 text-xs text-zinc-600">{helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
            <CardTitle className="text-base text-white">
              Últimas Transacciones
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Las ventas más recientes de tus eventos.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-0 pb-0">
            {metrics.recentSales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="pl-6 text-zinc-600">
                      Comprador
                    </TableHead>
                    <TableHead className="text-zinc-600">Fecha</TableHead>
                    <TableHead className="text-zinc-600">Monto</TableHead>
                    <TableHead className="pr-6 text-right text-zinc-600">
                      Estado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.recentSales.map((sale) => {
                    const status =
                      orderStatusPresentation[sale.status] ??
                      orderStatusPresentation.paid

                    return (
                      <TableRow
                        key={sale.id}
                        className="border-white/8 hover:bg-white/[0.025]"
                      >
                        <TableCell className="py-4 pl-6 font-medium text-zinc-200">
                          {sale.buyerName}
                        </TableCell>
                        <TableCell className="text-zinc-400">
                          {formatDateTime(sale.date)}
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums text-white">
                          {formatCurrency(sale.amount)}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Badge
                            variant="outline"
                            className={status.className}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/15">
                    <Ticket className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-white">
                    Tus ventas aparecerán aquí
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                    Cuando los compradores reserven entradas, vas a ver el
                    detalle de cada transacción en esta tabla.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.18),transparent_50%),rgba(255,255,255,0.035)] py-0 ring-1 ring-white/8">
          <CardHeader className="px-6 pt-6">
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/15">
              <CalendarPlus className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-lg text-white">Quick Actions</CardTitle>
            <CardDescription className="leading-6 text-zinc-500">
              Lanzá una nueva experiencia y configurá tickets, zonas y
              crecimiento en minutos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/admin/events/create" />}
              className="h-14 w-full rounded-2xl bg-violet-600 text-base font-semibold text-white shadow-xl shadow-violet-950/40 hover:bg-violet-500"
            >
              <Plus className="size-5" aria-hidden="true" />
              Crear Nuevo Evento
            </Button>
            <p className="mt-4 text-center text-xs text-zinc-600">
              Se guarda como borrador hasta que lo publiques.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
