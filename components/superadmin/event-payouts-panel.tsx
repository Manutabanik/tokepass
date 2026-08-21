"use client"

import {
  AlertOctagon,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  approveEventPayout,
  holdEventPayout,
  type EventPayoutRow,
} from "@/app/actions/event-payouts"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EVENT_PAYOUT_STATUS_LABEL } from "@/lib/finance/event-payouts"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function destinationLabel(row: EventPayoutRow) {
  if (row.bankCbu) return `CBU/CVU ${row.bankCbu}`
  if (row.bankAlias) return `Alias ${row.bankAlias}`
  return "Sin CBU/alias cargado"
}

function StatusBadge({ row }: { row: EventPayoutRow }) {
  const tone =
    row.payoutStatus === "hold"
      ? "border-rose-500/40 bg-rose-500/12 text-rose-800 dark:text-rose-100"
      : row.payoutStatus === "completed"
        ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-800 dark:text-emerald-100"
        : "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-100"
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full text-[10px] uppercase tracking-wide", tone)}
    >
      {EVENT_PAYOUT_STATUS_LABEL[row.payoutStatus]}
    </Badge>
  )
}

export function EventPayoutsPanel({
  initialRows,
}: {
  initialRows: EventPayoutRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [holdTarget, setHoldTarget] = useState<EventPayoutRow | null>(null)
  const [holdReason, setHoldReason] = useState("")

  function release(row: EventPayoutRow) {
    startTransition(async () => {
      const result = await approveEventPayout(row.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Pago liberado", {
        description: `${row.organizerName} · ${formatCurrency(row.netAmount)}`,
      })
      router.refresh()
    })
  }

  function confirmHold() {
    if (!holdTarget) return
    startTransition(async () => {
      const result = await holdEventPayout(holdTarget.id, holdReason)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Fondos retenidos", {
        description: "Se abrió el chat de soporte con el organizador.",
      })
      setHoldTarget(null)
      setHoldReason("")
      router.refresh()
    })
  }

  if (initialRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        No hay eventos finalizados con fondos listos para liquidar.
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {initialRows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-foreground">{row.eventTitle}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {row.organizerName}
                </p>
              </div>
              <StatusBadge row={row} />
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Recaudación bruta</dt>
                <dd className="font-mono font-semibold">
                  {formatCurrency(row.grossAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Comisión TokePass</dt>
                <dd className="font-mono">
                  {formatCurrency(row.serviceFeeAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Saldo neto</dt>
                <dd className="font-mono text-lg font-black text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(row.netAmount)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {destinationLabel(row)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Titular {row.bankHolder ?? "—"} · CUIT {row.bankTaxId ?? "—"}
            </p>
            {row.holdReason ? (
              <p className="mt-2 text-xs text-rose-700 dark:text-rose-200">
                {row.holdReason}
              </p>
            ) : null}
            <PayoutActions
              row={row}
              pending={pending}
              onRelease={() => release(row)}
              onHold={() => {
                setHoldTarget(row)
                setHoldReason("")
              }}
            />
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Evento</th>
              <th className="px-5 py-3 font-medium">Bruto</th>
              <th className="px-5 py-3 font-medium">Comisión TokePass</th>
              <th className="px-5 py-3 font-medium">Neto</th>
              <th className="px-5 py-3 font-medium">CBU / alias</th>
              <th className="px-5 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.map((row) => (
              <tr key={row.id} className="border-b border-border align-top">
                <td className="min-w-[150px] max-w-[250px] px-5 py-4">
                  <p className="truncate font-medium text-foreground">
                    {row.eventTitle}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.organizerName}
                  </p>
                  <div className="mt-2">
                    <StatusBadge row={row} />
                  </div>
                  {row.scheduledPayoutDate ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3" />
                      Est. {formatDateTime(row.scheduledPayoutDate)}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4 font-mono">
                  {formatCurrency(row.grossAmount)}
                </td>
                <td className="px-5 py-4 font-mono">
                  {formatCurrency(row.serviceFeeAmount)}
                </td>
                <td className="px-5 py-4 font-mono font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(row.netAmount)}
                </td>
                <td className="px-5 py-4">
                  <p className="font-mono text-xs">{destinationLabel(row)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.bankHolder ?? "Sin titular"} · {row.bankTaxId ?? "—"}
                  </p>
                  {row.bankVerified ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="size-3" />
                      Validado
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                      Cuenta sin verificar
                    </p>
                  )}
                  {row.holdReason ? (
                    <p className="mt-2 text-xs text-rose-700 dark:text-rose-200">
                      {row.holdReason}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4 text-right">
                  <PayoutActions
                    row={row}
                    pending={pending}
                    compact
                    onRelease={() => release(row)}
                    onHold={() => {
                      setHoldTarget(row)
                      setHoldReason("")
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Dialog
        open={Boolean(holdTarget)}
        onOpenChange={(open) => {
          if (!open) setHoldTarget(null)
        }}
      >
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-200">
              <AlertOctagon className="size-4" />
              Retener fondos
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {holdTarget
                ? `${holdTarget.eventTitle} · ${formatCurrency(holdTarget.netAmount)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="hold-reason">Motivo</Label>
            <Textarea
              id="hold-reason"
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
              placeholder="Ej. Reclamo pendiente por evento cancelado o CBU no coincide con el titular"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setHoldTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={confirmHold}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <AlertOctagon className="size-4" />
              )}
              Bloquear payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PayoutActions({
  row,
  pending,
  compact = false,
  onRelease,
  onHold,
}: {
  row: EventPayoutRow
  pending: boolean
  compact?: boolean
  onRelease: () => void
  onHold: () => void
}) {
  const canRelease =
    row.payoutStatus === "pending_approval" || row.payoutStatus === "processing"
  const canHold =
    row.payoutStatus !== "completed" && row.payoutStatus !== "cancelled"

  return (
    <div className={cn("grid gap-2", compact ? "justify-items-end" : "mt-4")}>
      {canRelease ? (
        <Button
          type="button"
          disabled={pending}
          onClick={onRelease}
          className={cn(
            "rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500",
            compact ? "min-h-10" : "min-h-12 w-full",
          )}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Aprobar transferencia
        </Button>
      ) : null}
      {canHold ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onHold}
          className={cn(
            "rounded-xl border-rose-500/40 bg-rose-500/10 font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-200",
            compact ? "min-h-10" : "min-h-12 w-full",
          )}
        >
          <AlertOctagon className="size-4" />
          Retener fondos
        </Button>
      ) : null}
      <Link
        href={`/superadmin/soporte?event=${row.eventId}`}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground",
          compact ? "min-h-9" : "min-h-11 w-full",
        )}
      >
        <Banknote className="size-4" />
        Ver soporte
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  )
}
