import type { Metadata } from "next"

import { getOrganizerPromoters } from "@/app/actions/promoters"
import { AddPromoterDialog } from "@/components/admin/add-promoter-dialog"
import { PromotersTeamTable } from "@/components/admin/promoters-team-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCurrency, formatNumber } from "@/lib/format"

export const metadata: Metadata = {
  title: "Promotores y RRPP",
  description: "Gestioná tu equipo de promotores y sus comisiones.",
}

export default async function AdminPromotersPage() {
  let promoters: Awaited<ReturnType<typeof getOrganizerPromoters>> = []
  let loadError: string | null = null

  try {
    promoters = await getOrganizerPromoters()
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar los promotores."
  }

  const totalRevenue = promoters.reduce(
    (sum, row) => sum + row.revenueGenerated,
    0,
  )
  const totalTickets = promoters.reduce((sum, row) => sum + row.ticketsSold, 0)
  const totalClicks = promoters.reduce((sum, row) => sum + row.clickCount, 0)
  const totalCommission = promoters.reduce(
    (sum, row) => sum + row.estimatedCommission,
    0,
  )
  const totalPending = promoters.reduce(
    (sum, row) => sum + row.pendingCommission,
    0,
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
            Difusión
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-foreground">
            Promotores y RRPP
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Invitá a tu equipo, compartí links con{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-violet-700 dark:bg-white/5 dark:text-violet-200">
              ?rrpp=CODIGO
            </code>{" "}
            (válido en toda TokePass, alias ?ref=) y medí clics, ventas y comisiones.
          </p>
        </div>
        <AddPromoterDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Promotores activos</CardDescription>
            <CardTitle className="text-3xl text-foreground">
              {formatNumber(promoters.length)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Clics / visitas</CardDescription>
            <CardTitle className="text-3xl text-foreground">
              {formatNumber(totalClicks)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Entradas vía promotores</CardDescription>
            <CardTitle className="text-3xl text-foreground">
              {formatNumber(totalTickets)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Comisión acumulada</CardDescription>
            <CardTitle className="text-3xl text-emerald-600 dark:text-emerald-300">
              {formatCurrency(totalCommission)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Pendiente de liquidar</CardDescription>
            <CardTitle className="text-3xl text-foreground">
              {formatCurrency(totalPending)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-foreground">
            Equipo comercial
          </CardTitle>
          <CardDescription>
            Ventas traídas: {formatCurrency(totalRevenue)}. Las comisiones se
            estiman sobre compras ya{" "}
            <span className="text-emerald-600 dark:text-emerald-300">
              pagadas
            </span>
            . Liquidá el saldo pendiente cuando le pagues al RRPP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-6 text-sm text-red-700 dark:text-red-200">
              {loadError}
            </p>
          ) : (
            <PromotersTeamTable initialPromoters={promoters} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
