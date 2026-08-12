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
import { formatCurrency, formatPercent } from "@/lib/format"

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-300">
            Difusión
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
            Promotores y RRPP
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Invitá a tu equipo, compartí links con{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-violet-200">
              ?ref=CODIGO
            </code>{" "}
            y medí comisiones solo sobre órdenes pagadas.
          </p>
        </div>
        <AddPromoterDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-white/8 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Promotores activos</CardDescription>
            <CardTitle className="text-3xl text-white">
              {promoters.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/8 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>Entradas vía promotores</CardDescription>
            <CardTitle className="text-3xl text-white">{totalTickets}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/8 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription>GMV referido</CardDescription>
            <CardTitle className="text-3xl text-emerald-300">
              {formatCurrency(totalRevenue)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-white/8 bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-white">Equipo comercial</CardTitle>
          <CardDescription>
            Las comisiones se calculan sobre órdenes con status{" "}
            <span className="text-emerald-300">paid</span> (Mercado Pago).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-6 text-sm text-red-200">
              {loadError}
            </p>
          ) : promoters.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 px-4 py-14 text-center">
              <Users className="size-8 text-zinc-600" aria-hidden="true" />
              <p className="mt-4 text-base font-semibold text-white">
                Todavía no tenés promotores
              </p>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Agregá el primero y compartí su link en Instagram / WhatsApp.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="text-zinc-500">Nombre</TableHead>
                  <TableHead className="text-zinc-500">Código</TableHead>
                  <TableHead className="text-zinc-500">Comisión</TableHead>
                  <TableHead className="text-right text-zinc-500">
                    Entradas
                  </TableHead>
                  <TableHead className="text-right text-zinc-500">
                    Ingresos
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoters.map((promoter) => (
                  <TableRow
                    key={promoter.id}
                    className="border-white/8 hover:bg-white/[0.02]"
                  >
                    <TableCell className="font-medium text-white">
                      {promoter.name}
                      {!promoter.userId && (
                        <Badge
                          variant="outline"
                          className="ml-2 rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                        >
                          Sin reclamar
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="rounded-lg bg-zinc-950 px-2 py-1 text-xs font-semibold tracking-wide text-violet-300 ring-1 ring-white/10">
                        {promoter.referralCode}
                      </code>
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {formatPercent(promoter.commissionRate * 100, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {promoter.ticketsSold}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-300">
                      {formatCurrency(promoter.revenueGenerated)}
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
