import type { Metadata } from "next"
import { Users } from "lucide-react"

import { getOrganizerPromoters } from "@/app/actions/promoters"
import { AddPromoterDialog } from "@/components/admin/add-promoter-dialog"
import { Badge } from "@/components/ui/badge"
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
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format"

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
              ?ref=CODIGO
            </code>{" "}
            (válido en toda Tokepass) y medí clics, ventas y comisiones.
          </p>
        </div>
        <AddPromoterDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-6 text-sm text-red-700 dark:text-red-200">
              {loadError}
            </p>
          ) : promoters.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-zinc-200 px-4 py-14 text-center dark:border-white/10">
              <Users className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-4 text-base font-semibold text-foreground">
                Todavía no tenés promotores
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Agregá el primero y compartí su link en Instagram / WhatsApp.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-200 hover:bg-transparent dark:border-white/8">
                  <TableHead className="text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-muted-foreground">Código</TableHead>
                  <TableHead className="text-muted-foreground">Comisión %</TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Clics
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Entradas
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Recaudación
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    A pagar
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoters.map((promoter) => (
                  <TableRow
                    key={promoter.id}
                    className="border-zinc-200 hover:bg-zinc-50 dark:border-white/8 dark:hover:bg-white/[0.02]"
                  >
                    <TableCell className="font-medium text-foreground">
                      {promoter.name}
                      {!promoter.userId && (
                        <Badge
                          variant="outline"
                          className="ml-2 rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                        >
                          Sin reclamar
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold tracking-wide text-violet-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-violet-300 dark:ring-white/10">
                        {promoter.referralCode}
                      </code>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {formatPercent(promoter.commissionRate * 100, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(promoter.clickCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(promoter.ticketsSold)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatCurrency(promoter.revenueGenerated)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-300">
                      {formatCurrency(promoter.estimatedCommission)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
