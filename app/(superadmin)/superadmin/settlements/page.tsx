import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { listEventPayouts } from "@/app/actions/event-payouts"
import {
  listPendingBankProfiles,
} from "@/app/actions/organizer-bank"
import { listPlatformPayoutRequests } from "@/app/actions/payouts"
import {
  getPlatformMoneyLedger,
  listPlatformSettlements,
} from "@/app/actions/superadmin"
import { BankReviewPanel } from "@/components/superadmin/bank-review-panel"
import { EventPayoutsPanel } from "@/components/superadmin/event-payouts-panel"
import {
  PlatformPayoutsPanel,
} from "@/components/superadmin/platform-payouts-panel"
import { PlatformSettlementsPanel } from "@/components/superadmin/platform-settlements-panel"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency } from "@/lib/format"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import { Banknote, CircleDollarSign, Sparkles, Wallet } from "lucide-react"

export const metadata: Metadata = {
  title: "Finanzas y Payouts",
}

export default async function SuperAdminSettlementsPage() {
  let eventPayouts: Awaited<ReturnType<typeof listEventPayouts>> = []
  let bankRows: Awaited<ReturnType<typeof listPendingBankProfiles>> = []
  let payoutRows: Awaited<ReturnType<typeof listPlatformPayoutRequests>> = []
  let settlementRows: Awaited<ReturnType<typeof listPlatformSettlements>> = []
  let ledgerTotals: Awaited<
    ReturnType<typeof getPlatformMoneyLedger>
  >["totals"] | null = null
  let errorMessage: string | null = null

  try {
    ;[eventPayouts, bankRows, payoutRows, settlementRows, { totals: ledgerTotals }] =
      await Promise.all([
        listEventPayouts({ status: "actionable" }),
        listPendingBankProfiles(),
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
        : "No se pudieron cargar las finanzas."
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/15 px-5 py-8 text-amber-950 dark:text-amber-50">
        <h1 className="text-xl font-bold">Finanzas no disponibles</h1>
        <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
          {errorMessage}
        </p>
      </div>
    )
  }

  const pendingEventNet = eventPayouts.reduce((sum, row) => sum + row.netAmount, 0)
  const pendingPayoutNet = payoutRows.reduce((sum, row) => sum + row.amount, 0)
  const pendingSettlementNet = settlementRows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.netAmount, 0)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-400/80">
          Torre de control
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-black tracking-tight text-foreground">
          <Banknote className="size-7 text-sky-600 dark:text-sky-300" />
          Finanzas y Payouts
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          TokePass centraliza la venta y libera el neto al CBU validado del
          organizador, evento por evento.
        </p>
      </div>

      {ledgerTotals ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-border bg-card py-0 text-card-foreground">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Recaudación bruta
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
                    Comisión TokePass
                  </p>
                  <p className="mt-3 break-words text-3xl font-black text-emerald-700 dark:text-emerald-300 sm:text-4xl">
                    {formatCurrency(ledgerTotals.platformFee)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ganancia neta retenida por la plataforma
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
                    Saldo neto a transferir
                  </p>
                  <p className="mt-3 break-words text-3xl font-black text-muted-foreground sm:text-4xl">
                    {formatCurrency(pendingEventNet + pendingPayoutNet + pendingSettlementNet)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Eventos listos: {formatCurrency(pendingEventNet)}
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

      <Tabs defaultValue="payouts" className="gap-5">
        <TabsList className="flex h-auto w-full flex-wrap rounded-xl bg-muted p-1">
          <TabsTrigger value="payouts" className="min-h-10 flex-1">
            Liquidaciones ({eventPayouts.length})
          </TabsTrigger>
          <TabsTrigger value="bank" className="min-h-10 flex-1">
            Cuentas ({bankRows.length})
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="min-h-10 flex-1">
            Retiros ({payoutRows.length})
          </TabsTrigger>
          <TabsTrigger value="legacy" className="min-h-10 flex-1">
            Legacy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payouts" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Liquidaciones pendientes
            </h2>
            <p className="text-sm text-muted-foreground">
              Eventos cuya fecha ya transcurrió y tienen fondos listos para
              liberar al CBU validado.
            </p>
          </div>
          <EventPayoutsPanel initialRows={eventPayouts} />
        </TabsContent>

        <TabsContent value="bank" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Validación CBU / CUIT
            </h2>
            <p className="text-sm text-muted-foreground">
              Confirmá que el titular coincida con el CUIT/DNI antes de
              liquidar.
            </p>
          </div>
          <BankReviewPanel initialRows={bankRows} />
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Solicitudes de retiro
            </h2>
            <p className="text-sm text-muted-foreground">
              {payoutRows.length} en cola · {formatCurrency(pendingPayoutNet)}
            </p>
          </div>
          <PlatformPayoutsPanel initialRows={payoutRows} />
        </TabsContent>

        <TabsContent value="legacy" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Liquidaciones legacy
            </h2>
            <p className="text-sm text-muted-foreground">
              Compatibilidad con organizer_settlements.
            </p>
          </div>
          <PlatformSettlementsPanel initialRows={settlementRows} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
