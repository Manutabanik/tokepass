import type { Metadata } from "next"
import {
  CalendarPlus,
  DollarSign,
  Landmark,
  Plus,
  Printer,
  Sparkles,
  Ticket,
  Wallet,
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
  title: "Resumen de Ventas",
}

const orderStatusPresentation: Record<
  string,
  { label: string; className: string }
> = {
  paid: {
    label: "Pagada",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-800 dark:text-emerald-300",
  },
  pending: {
    label: "Pendiente",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-800 dark:text-amber-300",
  },
  failed: {
    label: "Fallida",
    className: "border-red-400/20 bg-red-400/10 text-red-800 dark:text-red-300",
  },
}

export default async function AdminDashboardPage() {
  const metrics = await getDashboardMetrics()

  const kpis = [
    {
      label: "Recaudación bruta",
      value: formatCurrency(metrics.grossRevenue),
      helper:
        metrics.grossRevenue > 0
          ? "Solo ventas reales de producción"
          : "Las órdenes pendientes o de prueba no suman",
      icon: DollarSign,
    },
    {
      label: "Comisión TokePass",
      value: formatCurrency(metrics.tokepassServiceCharge),
      helper: "Service charge descontado del bruto",
      icon: Landmark,
    },
    {
      label: "Neto organizador",
      value: formatCurrency(metrics.organizerNetPayout),
      helper: "Bruto menos comisión de la plataforma",
      icon: Wallet,
    },
    {
      label: "Vendidos Web",
      value: String(metrics.webSold),
      helper:
        metrics.activeEvents > 0
          ? `${metrics.activeEvents} evento${metrics.activeEvents === 1 ? "" : "s"} activo${metrics.activeEvents === 1 ? "" : "s"} · venta digital`
          : "Compras online y boletería POS",
      icon: Ticket,
    },
    {
      label: "Impresos (Papel)",
      value: String(metrics.paperIssued),
      helper: "Lotes de imprenta. No consumen el cupo web.",
      icon: Printer,
    },
  ] as const

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-400">
            <Sparkles className="size-4" aria-hidden="true" />
            Resumen de Ventas
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
            Buen día.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            La recaudación sale del libro mayor: solo órdenes con estado pagado.
            Una orden pendiente no aparece en los gráficos hasta liquidarse.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ label, value, helper, icon: Icon }) => (
          <Card
            key={label}
            className="border-0 bg-card py-0 shadow-sm ring-1 ring-border"
          >
            <CardContent className="px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/10">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-5 text-3xl font-bold tracking-[-0.045em] text-foreground sm:text-4xl">
                {value}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="border-0 bg-card py-0 shadow-sm ring-1 ring-border">
          <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
            <CardTitle className="text-base text-foreground">
              Últimas compras
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Últimas órdenes pagadas. Las pendientes no se listan.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-0 pb-0">
            {metrics.recentSales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="pl-6 text-muted-foreground">
                      Comprador
                    </TableHead>
                    <TableHead className="text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-muted-foreground">Monto</TableHead>
                    <TableHead className="pr-6 text-right text-muted-foreground">
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
                        className="border-border hover:bg-white/[0.025]"
                      >
                        <TableCell className="py-4 pl-6 font-medium text-foreground">
                          {sale.buyerName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(sale.date)}
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums text-foreground">
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
                  <h3 className="mt-5 text-base font-semibold text-foreground">
                    Tus ventas van a aparecer acá
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    Cuando alguien compre una entrada, vas a ver el detalle de
                    cada compra en esta tabla.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.14),transparent_50%)] py-0 shadow-sm ring-1 ring-border">
          <CardHeader className="px-6 pt-6">
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/15">
              <CalendarPlus className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-lg text-foreground">
              Empezá por acá
            </CardTitle>
            <CardDescription className="leading-6 text-muted-foreground">
              Creá tu evento, armá los tipos de entrada y publicá cuando esté
              listo.
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
              Nuevo Evento
            </Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Se guarda como borrador hasta que lo publiques.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
