import {
  Building2,
  CircleDollarSign,
  ShieldCheck,
  TicketCheck,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import { getControlTowerSnapshot } from "@/app/actions/control-tower"
import { getAllOrganizers, getGlobalMetrics } from "@/app/actions/superadmin"
import { ControlTowerAlerts } from "@/components/superadmin/control-tower-alerts"
import { EventAuditWorkbench } from "@/components/superadmin/event-audit-workbench"
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
  title: "Torre de control",
  description:
    "Auditoría de eventos, soporte a organizadores y control del negocio.",
}

export default async function SuperAdminDashboardPage() {
  let metrics: Awaited<ReturnType<typeof getGlobalMetrics>>
  let organizers: Awaited<ReturnType<typeof getAllOrganizers>>
  let tower: Awaited<ReturnType<typeof getControlTowerSnapshot>>

  try {
    ;[metrics, organizers, tower] = await Promise.all([
      getGlobalMetrics(),
      getAllOrganizers(),
      getControlTowerSnapshot(),
    ])
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      redirect("/")
    }
    throw error
  }

  const kpis = [
    {
      label: "Ganancia de TokePass",
      value: formatCurrency(metrics.platform_revenue),
      helper: "Comisión en compras pagadas",
      icon: ShieldCheck,
      accent: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Dinero procesado",
      value: formatCurrency(metrics.totalGmv),
      helper: "Total pagado por compradores",
      icon: CircleDollarSign,
      accent: "text-amber-800 dark:text-amber-300",
    },
    {
      label: "Entradas emitidas",
      value: formatNumber(metrics.total_tickets),
      helper: "Válidas y escaneadas",
      icon: TicketCheck,
      accent: "text-foreground",
    },
    {
      label: "Productoras activas",
      value: formatNumber(metrics.active_organizers),
      helper: "Cuentas con permiso de organizador",
      icon: Building2,
      accent: "text-foreground",
    },
  ] as const

  return (
    <>
      <PageHeading
        eyebrow="Torre de control"
        title="Operación en vivo"
        description="Auditar eventos, responder soporte y seguir el negocio desde un solo panel."
      />

      <ControlTowerAlerts
        pendingCount={tower.pendingCount}
        unreadSupportCount={tower.unreadSupportCount}
        pendingPayoutCount={tower.pendingPayoutCount}
      />

      <section id="auditoria" className="mt-8 scroll-mt-24">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Modo Auditoría</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Elegí un evento pendiente y aprobalo, pedí cambios o rechazalo.
            </p>
          </div>
        </div>
        <EventAuditWorkbench events={tower.pendingEvents} />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, helper, icon: Icon, accent }) => (
          <Card key={label} className="border-border bg-card py-0 text-card-foreground">
            <CardContent className="px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
              </div>
              <p className={`mt-5 text-3xl font-bold tracking-[-0.04em] ${accent}`}>
                {value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-border bg-card py-0 text-card-foreground">
        <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-foreground">Productoras</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ventas confirmadas de cada productora.
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
                  className="rounded-xl border border-border bg-muted/40 p-4"
                >
                  <p className="min-w-0 truncate font-semibold text-foreground">
                    {organizer.name}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {organizer.email}
                  </p>
                  <p className="mt-3 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(organizer.billedVolume)}
                  </p>
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
                    <TableRow key={organizer.id} className="border-border hover:bg-muted/50">
                      <TableCell className="min-w-[150px] max-w-[250px] py-4 pl-6">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-500/15 text-xs font-medium text-sky-700 dark:text-sky-300">
                            {getInitials(organizer.name, organizer.email)}
                          </span>
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {organizer.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[150px] max-w-[250px] text-muted-foreground">
                        <span className="block truncate">{organizer.email}</span>
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
                            <Link href={`/admin/events/create?organizerId=${organizer.id}`} />
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
