"use client"

import { Banknote, Landmark, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  requestSettlement,
  type OrganizerFinanceSummary,
} from "@/app/actions/finances"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof Wallet
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            {label}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            {value}
          </p>
          <p className="mt-2 text-sm text-zinc-500">{hint}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}

export function OrganizerFinancesDashboard({
  summary,
}: {
  summary: OrganizerFinanceSummary
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const canRequest = summary.availableToSettle >= 1

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
            Liquidaciones
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
            Ventas y Dinero
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Venta bruta All-In. El efectivo de boletería ya está en mano del
            organizador, pero su comisión Tokepass (15%) se descuenta del saldo
            liquidable de Mercado Pago.
          </p>
        </div>
        <Button
          type="button"
          disabled={!canRequest || pending}
          className="h-11 rounded-full bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
          onClick={() => {
            startTransition(async () => {
              const result = await requestSettlement({
                periodLabel: `Solicitud ${new Date().toLocaleDateString("es-AR")}`,
              })
              if (!result.success) {
                toast.error(result.error)
                return
              }
              toast.success("Pediste la liquidación. El equipo de Tokepass la va a completar.")
              router.refresh()
            })
          }}
        >
          {pending ? "Solicitando…" : "Solicitar liquidación"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Venta bruta total"
          value={formatCurrency(summary.grossRevenue)}
          hint={`MP ${formatCurrency(summary.mercadopagoGross)} · POS ${formatCurrency(summary.posGross)}`}
          icon={Banknote}
        />
        <StatCard
          label="Comisión Tokepass (15%)"
          value={formatCurrency(summary.platformFees)}
          hint={`MP ${formatCurrency(summary.mpPlatformFees)} · POS ${formatCurrency(summary.posPlatformFees)}`}
          icon={Landmark}
        />
        <StatCard
          label="Neto a liquidar"
          value={formatCurrency(summary.netRevenue)}
          hint="MP bruto − comisión MP − comisión POS"
          icon={Wallet}
        />
        <StatCard
          label="Disponible a liquidar"
          value={formatCurrency(summary.availableToSettle)}
          hint={
            summary.platformFeeDebt > 0
              ? `Deuda fee POS: ${formatCurrency(summary.platformFeeDebt)} · cola: ${formatCurrency(summary.pendingSettlementNet)}`
              : `Cola pendiente: ${formatCurrency(summary.pendingSettlementNet)}`
          }
          icon={Wallet}
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Historial de liquidaciones
            </h2>
            <p className="text-sm text-zinc-500">
              Pedís liquidación acá; Platform OS marca completed al transferir.
            </p>
          </div>
        </div>

        {summary.settlements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
            Todavía no hay liquidaciones. Cuando tengas saldo MP disponible,
            solicitá una liquidación.
          </div>
        ) : (
          <div className="grid gap-2">
            {summary.settlements.map((row) => (
              <article
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-white">
                    {row.periodLabel ?? "Liquidación"}
                  </p>
                  <p className="text-sm text-zinc-500">
                    Neto {formatCurrency(row.netAmount)} · Bruto{" "}
                    {formatCurrency(row.grossAmount)} · Fee{" "}
                    {formatCurrency(row.platformFee)}
                  </p>
                  {row.notes ? (
                    <p className="mt-1 text-xs text-zinc-600">{row.notes}</p>
                  ) : null}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit rounded-full text-[10px] uppercase",
                    row.status === "completed"
                      ? "border-emerald-500/40 text-emerald-200"
                      : "border-amber-500/40 text-amber-100",
                  )}
                >
                  {row.status}
                </Badge>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
