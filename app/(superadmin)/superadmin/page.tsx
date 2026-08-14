import {
  Building2,
  CircleDollarSign,
  Sparkles,
  TicketCheck,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  SuperAdminForbiddenError,
} from "@/lib/superadmin-errors"
import {
  getAllOrganizers,
  getGlobalMetrics,
} from "@/app/actions/superadmin"
import { PageHeading } from "@/components/superadmin/page-heading"
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
import { formatCurrency, formatNumber, getInitials } from "@/lib/format"

export const metadata: Metadata = {
  title: "Resumen",
  description:
    "Panel de control de Tokepass: plata recaudada, entradas emitidas y productoras.",
}

export default async function SuperAdminDashboardPage() {
  let metrics: Awaited<ReturnType<typeof getGlobalMetrics>>
  let organizers: Awaited<ReturnType<typeof getAllOrganizers>>

  try {
    ;[metrics, organizers] = await Promise.all([
      getGlobalMetrics(),
      getAllOrganizers(),
    ])
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      redirect("/")
    }
    throw error
  }

  const kpis = [
    {
      label: "Ganancia de Tokepass",
      value: formatCurrency(metrics.platform_revenue),
      helper: "Lo que nos queda de comisión en las compras pagadas",
      icon: Sparkles,
      accent: "text-emerald-700 dark:text-emerald-400",
      iconWrap: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
      featured: true,
    },
    {
      label: "Dinero procesado",
      value: formatCurrency(metrics.totalGmv),
      helper: "Total que pagaron los compradores (entradas + comisión)",
      icon: CircleDollarSign,
      accent: "text-amber-800 dark:text-amber-300",
      iconWrap: "bg-amber-500/15 text-amber-800 ring-amber-500/15 dark:text-amber-300",
      featured: false,
    },
    {
      label: "Entradas emitidas",
      value: formatNumber(metrics.total_tickets),
      helper: "Entradas válidas y las que ya se escanearon en puerta",
      icon: TicketCheck,
      accent: "text-foreground",
      iconWrap: "bg-sky-500/15 text-sky-700 ring-sky-500/15 dark:text-sky-400",
      featured: false,
    },
    {
      label: "Productoras activas",
      value: formatNumber(metrics.active_organizers),
      helper: "Cuentas con permiso de organizador",
      icon: Building2,
      accent: "text-foreground",
      iconWrap: "bg-violet-500/15 text-violet-700 ring-violet-500/15 dark:text-violet-300",
      featured: false,
    },
  ] as const

  return (
    <>
      <PageHeading
        eyebrow="Dueño de la Plataforma"
        title="Resumen general"
        description="Mirás de un vistazo cuánto genera Tokepass, cuánto se movió en ventas y cómo van las productoras."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(
          ({ label, value, helper, icon: Icon, accent, iconWrap, featured }) => (
            <Card
              key={label}
              className={
                featured
                  ? "border-border bg-gradient-to-br from-emerald-500/15 via-card to-card py-0 ring-1 ring-emerald-500/30 sm:col-span-2 xl:col-span-1"
                  : "border-border bg-card py-0 text-card-foreground"
              }
            >
              <CardContent className="px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <span
                    className={`grid size-10 place-items-center rounded-xl ring-1 ring-inset ${iconWrap}`}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                </div>
                <p
                  className={`mt-5 break-words font-bold tracking-[-0.04em] ${accent} text-3xl sm:text-4xl`}
                >
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <Card className="mt-6 border-border bg-card py-0 text-card-foreground">
        <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-foreground">Productoras</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ventas confirmadas de cada productora. Con “Crear evento” podés
            armar un evento a nombre de ellas.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {organizers.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
              Todavía no hay productoras registradas.
            </p>
          ) : (
            <>
              <div className="grid gap-3 p-4 md:hidden">
                {organizers.map((organizer) => (
                  <article
                    key={organizer.id}
                    className="rounded-2xl border border-border bg-muted/40 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sm font-medium text-sky-700 dark:text-sky-300">
                        {getInitials(organizer.name, organizer.email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold text-foreground">
                          {organizer.name}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {organizer.email}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(organizer.billedVolume)}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {formatNumber(organizer.activeEvents)} eventos activos
                        </p>
                      </div>
                      <Button
                        className="min-h-12 shrink-0 rounded-xl border-border bg-transparent px-4 font-semibold text-foreground hover:bg-muted"
                        variant="outline"
                        nativeButton={false}
                        render={
                          <Link
                            href={`/admin/events/create?organizerId=${organizer.id}`}
                          />
                        }
                      >
                        Crear evento
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="bg-muted/50 pl-6 text-muted-foreground">
                        Nombre
                      </TableHead>
                      <TableHead className="bg-muted/50 text-muted-foreground">
                        Email
                      </TableHead>
                      <TableHead className="bg-muted/50 text-right text-muted-foreground">
                        Eventos activos
                      </TableHead>
                      <TableHead className="bg-muted/50 text-right text-muted-foreground">
                        Volumen facturado
                      </TableHead>
                      <TableHead className="bg-muted/50 pr-6 text-right text-muted-foreground">
                        Acciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizers.map((organizer) => (
                      <TableRow
                        key={organizer.id}
                        className="border-border hover:bg-muted/50"
                      >
                        <TableCell className="py-4 pl-6">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-500/15 text-xs font-medium text-sky-700 dark:text-sky-300">
                              {getInitials(organizer.name, organizer.email)}
                            </span>
                            <span className="font-medium text-foreground">
                              {organizer.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {organizer.email}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {formatNumber(organizer.activeEvents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(organizer.billedVolume)}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11 rounded-full border-border bg-transparent text-foreground hover:bg-muted"
                            nativeButton={false}
                            render={
                              <Link
                                href={`/admin/events/create?organizerId=${organizer.id}`}
                              />
                            }
                          >
                            Crear evento
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
