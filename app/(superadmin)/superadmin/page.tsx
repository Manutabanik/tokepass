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
      accent: "text-emerald-400",
      iconWrap: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25",
      featured: true,
    },
    {
      label: "Dinero procesado",
      value: formatCurrency(metrics.totalGmv),
      helper: "Total que pagaron los compradores (entradas + comisión)",
      icon: CircleDollarSign,
      accent: "text-amber-300",
      iconWrap: "bg-amber-500/10 text-amber-300 ring-amber-500/15",
      featured: false,
    },
    {
      label: "Entradas emitidas",
      value: formatNumber(metrics.total_tickets),
      helper: "Entradas válidas y las que ya se escanearon en puerta",
      icon: TicketCheck,
      accent: "text-white",
      iconWrap: "bg-sky-500/10 text-sky-400 ring-sky-500/15",
      featured: false,
    },
    {
      label: "Productoras activas",
      value: formatNumber(metrics.active_organizers),
      helper: "Cuentas con permiso de organizador",
      icon: Building2,
      accent: "text-white",
      iconWrap: "bg-violet-500/10 text-violet-300 ring-violet-500/15",
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(
          ({ label, value, helper, icon: Icon, accent, iconWrap, featured }) => (
            <Card
              key={label}
              className={
                featured
                  ? "border-0 bg-gradient-to-br from-emerald-500/15 via-white/[0.04] to-white/[0.02] py-0 ring-1 ring-emerald-400/30 md:col-span-2 xl:col-span-1"
                  : "border-0 bg-white/[0.035] py-0 ring-1 ring-white/8"
              }
            >
              <CardContent className="px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-zinc-500">{label}</p>
                  <span
                    className={`grid size-10 place-items-center rounded-xl ring-1 ring-inset ${iconWrap}`}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                </div>
                <p
                  className={`mt-5 font-bold tracking-[-0.04em] ${accent} ${featured ? "text-4xl" : "text-3xl"}`}
                >
                  {value}
                </p>
                <p className="mt-1 text-xs text-zinc-600">{helper}</p>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <Card className="mt-6 border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-white">Productoras</CardTitle>
          <CardDescription className="text-zinc-500">
            Ventas confirmadas de cada productora. Con “Crear evento” podés
            armar un evento a nombre de ellas.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {organizers.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500">
              Todavía no hay productoras registradas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="pl-6 text-zinc-600">Nombre</TableHead>
                  <TableHead className="text-zinc-600">Email</TableHead>
                  <TableHead className="text-right text-zinc-600">
                    Eventos activos
                  </TableHead>
                  <TableHead className="text-right text-zinc-600">
                    Volumen facturado
                  </TableHead>
                  <TableHead className="pr-6 text-right text-zinc-600">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizers.map((organizer) => (
                  <TableRow
                    key={organizer.id}
                    className="border-white/8 hover:bg-white/[0.025]"
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-500/10 text-xs font-medium text-sky-300">
                          {getInitials(organizer.name, organizer.email)}
                        </span>
                        <span className="font-medium text-zinc-200">
                          {organizer.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {organizer.email}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-300">
                      {formatNumber(organizer.activeEvents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-400">
                      {formatCurrency(organizer.billedVolume)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-white/15 bg-transparent text-zinc-200 hover:bg-white/5 hover:text-white"
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
          )}
        </CardContent>
      </Card>
    </>
  )
}
