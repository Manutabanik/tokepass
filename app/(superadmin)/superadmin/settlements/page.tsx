import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { listPlatformPayoutRequests } from "@/app/actions/payouts"
import {
  getPlatformMoneyLedger,
  listPlatformSettlements,
} from "@/app/actions/superadmin"
import {
  PlatformPayoutsHeader,
  PlatformPayoutsPanel,
} from "@/components/superadmin/platform-payouts-panel"
import { PlatformSettlementsPanel } from "@/components/superadmin/platform-settlements-panel"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { formatCurrency } from "@/lib/format"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import { CircleDollarSign, Sparkles, Wallet } from "lucide-react"

export const metadata: Metadata = {
  title: "Liquidaciones",
}

export default async function SuperAdminSettlementsPage() {
  let payoutRows: Awaited<ReturnType<typeof listPlatformPayoutRequests>> = []
  let settlementRows: Awaited<ReturnType<typeof listPlatformSettlements>> = []
  let ledgerTotals: Awaited<
    ReturnType<typeof getPlatformMoneyLedger>
  >["totals"] | null = null
  let errorMessage: string | null = null

  try {
    ;[payoutRows, settlementRows, { totals: ledgerTotals }] = await Promise.all([
      listPlatformPayoutRequests({ status: "pending" }),
      listPlatformSettlements(),
      getPlatformMoneyLedger({ status: "paid", limit: 500 }),
    ])
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      redirect("/")
    }
    errorMessage =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar liquidaciones."
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-8 text-amber-50">
        <h1 className="text-xl font-bold">Liquidaciones no disponibles</h1>
        <p className="mt-2 text-sm text-amber-100/80">{errorMessage}</p>
      </div>
    )
  }

  const pendingPayoutNet = payoutRows.reduce((sum, row) => sum + row.amount, 0)
  const pendingSettlementNet = settlementRows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.netAmount, 0)

  return (
    <div className="space-y-8">
      <PlatformPayoutsHeader />

      {ledgerTotals ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                    Total cobrado (pagado)
                  </p>
                  <p className="mt-3 text-3xl font-black text-white">
                    {formatCurrency(ledgerTotals.gross)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {ledgerTotals.paidCount} compras pagadas
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
                  <CircleDollarSign className="size-5 text-white" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-emerald-500/15 via-white/[0.04] to-white/[0.02] py-0 ring-1 ring-emerald-400/30">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                    Comisión de la ticketera
                  </p>
                  <p className="mt-3 text-3xl font-black text-emerald-300">
                    {formatCurrency(ledgerTotals.platformFee)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Lo que se queda Tokepass de esas compras
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-400/25">
                  <Sparkles className="size-5 text-emerald-300" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                    A pagar a productoras
                  </p>
                  <p className="mt-3 text-3xl font-black text-zinc-300">
                    {formatCurrency(ledgerTotals.organizerNet)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Retiros pendientes:{" "}
                    {formatCurrency(pendingPayoutNet + pendingSettlementNet)}
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-zinc-500/10 ring-1 ring-zinc-400/20">
                  <Wallet className="size-5 text-zinc-300" />
                </span>
              </div>
              <Link
                href="/superadmin/orders?status=paid"
                className="mt-4 inline-flex text-xs font-medium text-sky-400 transition hover:text-sky-300"
              >
                Ver compras pagadas
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            Solicitudes de retiro pendientes
          </h2>
          <p className="text-sm text-zinc-500">
            {payoutRows.length} en cola · {formatCurrency(pendingPayoutNet)}
          </p>
        </div>
        <PlatformPayoutsPanel initialRows={payoutRows} />
      </section>

      <section className="space-y-4 border-t border-white/8 pt-8">
        <div>
          <h2 className="text-lg font-bold text-white">
            Liquidaciones legacy
          </h2>
          <p className="text-sm text-zinc-500">
            Solicitudes anteriores vía organizer_settlements (compatibilidad).
          </p>
        </div>
        <PlatformSettlementsPanel initialRows={settlementRows} />
      </section>
    </div>
  )
}
