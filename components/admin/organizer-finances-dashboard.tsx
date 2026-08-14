"use client"

import {
  ArrowRightLeft,
  Banknote,
  Landmark,
  LoaderCircle,
  Lock,
  Wallet,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  requestPayout,
  type FinancePayoutRequest,
  type OrganizerFinanceSummary,
} from "@/app/actions/finances"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency, formatDateTime } from "@/lib/format"
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
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:text-zinc-400">
            {label}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            {value}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">{hint}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  processing: "En proceso",
  completed: "Transferido",
  rejected: "Rechazado",
}

export function OrganizerFinancesDashboard({
  summary,
}: {
  summary: OrganizerFinanceSummary
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [cbu, setCbu] = useState(summary.defaultCbu ?? "")
  const [pending, startTransition] = useTransition()

  const available = summary.availableToSettle
  const canRequest = available >= 1

  const history = useMemo(() => {
    const payouts = summary.payoutRequests.map((row) => ({
      kind: "payout" as const,
      ...row,
      sortAt: row.createdAt,
    }))
    const settlements = summary.settlements.map((row) => ({
      kind: "settlement" as const,
      id: row.id,
      amount: row.netAmount,
      status: row.status,
      cbuDestination: "—",
      adminNotes: row.notes,
      createdAt: row.createdAt,
      sortAt: row.createdAt,
      label: row.periodLabel ?? "Liquidación legacy",
    }))
    return [...payouts, ...settlements].sort((a, b) =>
      a.sortAt < b.sortAt ? 1 : -1,
    )
  }, [summary.payoutRequests, summary.settlements])

  function openModal() {
    setAmount(available > 0 ? String(Math.floor(available)) : "")
    setCbu(summary.defaultCbu ?? "")
    setOpen(true)
  }

  function submitPayout() {
    const parsed = Number(amount.replace(",", "."))
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error("Ingresá un monto válido.")
      return
    }
    if (parsed > available) {
      toast.error("El monto no puede superar el saldo disponible.")
      return
    }
    if (cbu.trim().length < 6) {
      toast.error("Confirmá tu CBU/CVU o alias.")
      return
    }

    startTransition(async () => {
      const result = await requestPayout({
        amount: parsed,
        cbuDestination: cbu.trim(),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Solicitud de retiro enviada", {
        description: "El Dueño de la Plataforma la va a revisar.",
      })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
            Mi billetera
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
            Recaudación y Retiros
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Acá ves cuánto recaudaste, qué se queda Tokepass y cuánto podés
            pedir que te transfieran. El saldo retenido se libera cuando termina
            el evento.
          </p>
        </div>
        <Button
          type="button"
          disabled={!canRequest}
          onClick={openModal}
          className="h-11 rounded-full bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
        >
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          Solicitar Retiro
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Recaudación Bruta"
          value={formatCurrency(summary.grossRevenue)}
          hint={`Online ${formatCurrency(summary.mercadopagoGross)} · Puerta ${formatCurrency(summary.posGross)}`}
          icon={Banknote}
        />
        <StatCard
          label="Comisión Tokepass"
          value={formatCurrency(summary.platformFees)}
          hint="Descontada de tu ganancia"
          icon={Landmark}
        />
        <StatCard
          label="Saldo Retenido"
          value={formatCurrency(summary.retainedHeld)}
          hint="Garantía pre-evento (se libera al finalizar)"
          icon={Lock}
        />
        <StatCard
          label="Saldo Disponible"
          value={formatCurrency(summary.availableToSettle)}
          hint={
            summary.pendingSettlementNet > 0
              ? `En cola de revisión: ${formatCurrency(summary.pendingSettlementNet)}`
              : "Listo para solicitar retiro"
          }
          icon={Wallet}
        />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Historial de retiros
          </h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Pedís el retiro acá; Tokepass lo marca como transferido cuando te
            manda la plata.
          </p>
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center text-sm text-slate-600 dark:text-zinc-400">
            Todavía no pediste retiros. Cuando tengas saldo disponible, usá
            Solicitar Retiro.
          </div>
        ) : (
          <div className="grid gap-2">
            {history.map((row) => (
              <article
                key={`${row.kind}-${row.id}`}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-white">
                    {row.kind === "payout"
                      ? "Solicitud de retiro"
                      : (row as { label: string }).label}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                    {formatCurrency(row.amount)}
                    {row.kind === "payout" && row.cbuDestination !== "—"
                      ? ` · CBU/CVU ${row.cbuDestination}`
                      : ""}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {formatDateTime(row.createdAt)}
                  </p>
                  {row.adminNotes ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-200/80">
                      Motivo: {row.adminNotes}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit rounded-full text-[10px] uppercase",
                    row.status === "completed"
                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-200"
                      : row.status === "rejected"
                        ? "border-red-500/40 text-red-700 dark:text-red-200"
                        : "border-amber-500/40 text-amber-800 dark:text-amber-100",
                  )}
                >
                  {PAYOUT_STATUS_LABEL[row.status] ?? row.status}
                </Badge>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-violet-500" />
              Solicitar Retiro
            </DialogTitle>
            <DialogDescription>
              Disponible: {formatCurrency(available)}. El monto no puede
              superar ese saldo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="payout-amount">Monto a retirar (ARS)</Label>
              <Input
                id="payout-amount"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*"
                autoComplete="off"
                min={1}
                step="0.01"
                max={available}
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^\d.]/g, ""))
                }
                disabled={pending}
                className="min-h-12 h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-cbu">CBU / CVU o alias</Label>
              <Input
                id="payout-cbu"
                value={cbu}
                onChange={(event) => setCbu(event.target.value)}
                disabled={pending}
                inputMode="numeric"
                autoCapitalize="none"
                placeholder="Confirmá la cuenta de destino"
                className="min-h-12 h-12 text-base"
              />
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Tokepass te transfiere acá cuando apruebe el retiro.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={submitPayout}
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Wallet />
              )}
              Confirmar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export type { FinancePayoutRequest }
