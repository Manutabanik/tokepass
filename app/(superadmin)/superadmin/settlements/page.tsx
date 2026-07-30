import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  getPlatformMoneyLedger,
  listPlatformSettlements,
} from "@/app/actions/superadmin"
import { PlatformSettlementsPanel } from "@/components/superadmin/platform-settlements-panel"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { formatCurrency } from "@/lib/format"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import { CircleDollarSign, Sparkles, Wallet } from "lucide-react"

export const metadata: Metadata = {
  title: "Money Ledger · Liquidaciones",
}

export default async function SuperAdminSettlementsPage() {
  let rows: Awaited<ReturnType<typeof listPlatformSettlements>> = []
  let ledgerTotals: Awaited<
    ReturnType<typeof getPlatformMoneyLedger>
  >["totals"] | null = null
  let errorMessage: string | null = null

  try {
    ;[rows, { totals: ledgerTotals }] = await Promise.all([
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

  const pendingNet = rows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.netAmount, 0)

  return (
    <div className="space-y-8">
      {ledgerTotals ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                    GMV pagado (ledger)
                  </p>
                  <p className="mt-3 text-3xl font-black text-white">
                    {formatCurrency(ledgerTotals.gross)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {ledgerTotals.paidCount} órdenes paid
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
                    Comisión Tokepass
                  </p>
                  <p className="mt-3 text-3xl font-black text-emerald-300">
                    {formatCurrency(ledgerTotals.platformFee)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Revenue propio retenido All-In
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
                    Neto productoras / pending
                  </p>
                  <p className="mt-3 text-3xl font-black text-zinc-300">
                    {formatCurrency(ledgerTotals.organizerNet)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Liquidaciones pending: {formatCurrency(pendingNet)}
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
                Abrir Money Ledger de órdenes →
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <PlatformSettlementsPanel initialRows={rows} />
    </div>
  )
}
