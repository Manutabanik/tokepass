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
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/15 px-5 py-8 text-amber-950 dark:text-amber-50">
        <h1 className="text-xl font-bold">Liquidaciones no disponibles</h1>
        <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
          {errorMessage}
        </p>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-border bg-card py-0 text-card-foreground">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Total cobrado (pagado)
                  </p>
                  <p className="mt-3 break-words text-3xl font-black text-foreground sm:text-4xl">
                    {formatCurrency(ledgerTotals.gross)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ledgerTotals.paidCount} compras pagadas
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-muted ring-1 ring-border">
                  <CircleDollarSign className="size-5 text-foreground" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-to-br from-emerald-500/15 via-card to-card py-0 ring-1 ring-emerald-500/30">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Comisión de la ticketera
                  </p>
                  <p className="mt-3 break-words text-3xl font-black text-emerald-700 dark:text-emerald-300 sm:text-4xl">
                    {formatCurrency(ledgerTotals.platformFee)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lo que se queda Tokepass de esas compras
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
                  <Sparkles className="size-5 text-emerald-700 dark:text-emerald-300" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card py-0 text-card-foreground">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    A pagar a productoras
                  </p>
                  <p className="mt-3 break-words text-3xl font-black text-muted-foreground sm:text-4xl">
                    {formatCurrency(ledgerTotals.organizerNet)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Retiros pendientes:{" "}
                    {formatCurrency(pendingPayoutNet + pendingSettlementNet)}
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-muted ring-1 ring-border">
                  <Wallet className="size-5 text-muted-foreground" />
                </span>
              </div>
              <Link
                href="/superadmin/orders?status=paid"
                className="mt-4 inline-flex text-xs font-medium text-sky-700 transition hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
              >
                Ver compras pagadas
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Solicitudes de retiro pendientes
          </h2>
          <p className="text-sm text-muted-foreground">
            {payoutRows.length} en cola · {formatCurrency(pendingPayoutNet)}
          </p>
        </div>
        <PlatformPayoutsPanel initialRows={payoutRows} />
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Liquidaciones legacy
          </h2>
          <p className="text-sm text-muted-foreground">
            Solicitudes anteriores vía organizer_settlements (compatibilidad).
          </p>
        </div>
        <PlatformSettlementsPanel initialRows={settlementRows} />
      </section>
    </div>
  )
}
