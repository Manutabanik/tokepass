"use client"

import {
  AlertTriangle,
  LoaderCircle,
  OctagonAlert,
  ShieldAlert,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  executeMassEventRefund,
  type MassRefundPreview,
} from "@/app/actions/superadmin-refunds"
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
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

const CONFIRM_PHRASE = "CONFIRMAR CANCELACION"

function riskLabel(tier: string) {
  if (tier === "TIER_1_CUSTODY") return "Estado Financiero Seguro"
  return `Nivel de Riesgo: ${tier.replaceAll("_", " ")}`
}

export function EventMassRefundDangerZone({
  preview,
}: {
  preview: MassRefundPreview
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()

  const canSubmit =
    confirmText.trim() === CONFIRM_PHRASE && reason.trim().length >= 8

  function handleExecute() {
    if (!canSubmit) return

    startTransition(async () => {
      const result = await executeMassEventRefund(preview.eventId, reason)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Devolución masiva ejecutada", {
        description: `${formatNumber(result.data.ordersRefunded)} compras · ${formatNumber(result.data.ticketsCancelled)} entradas anuladas`,
      })
      setOpen(false)
      setConfirmText("")
      setReason("")
      router.refresh()
    })
  }

  return (
    <section className="rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/70 via-zinc-950 to-zinc-950 p-6 shadow-[0_0_40px_rgba(239,68,68,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
            <OctagonAlert className="size-3.5" aria-hidden="true" />
            Zona de Peligro
          </p>
          <h2 className="mt-2 text-xl font-black text-white">
            Cancelar evento y devolver la plata
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-red-100/70">
            Usá esto solo en caso de fuerza mayor. Anula todas las entradas y
            dispara la devolución del dinero a los compradores.
          </p>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-black/30 px-4 py-3 text-right">
          <p className="font-mono text-2xl font-black text-red-200">
            {formatNumber(preview.validTickets)}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-red-300/70">
            entradas en riesgo
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Compras pagadas
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {formatNumber(preview.paidOrders)}
          </p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Plata a devolver
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {formatCurrency(preview.refundableAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Estado financiero
          </p>
          <p className="mt-1 text-sm font-bold text-amber-200">
            {riskLabel(preview.riskTier)}
          </p>
        </div>
      </div>

      <Button
        type="button"
        disabled={preview.eventStatus === "cancelled" || isPending}
        onClick={() => setOpen(true)}
        className={cn(
          "mt-6 h-12 w-full rounded-2xl bg-red-600 text-sm font-bold uppercase tracking-wide text-white",
          "shadow-[0_0_28px_rgba(220,38,38,0.35)] hover:bg-red-500",
        )}
      >
        <AlertTriangle className="size-4" aria-hidden="true" />
        Cancelar evento y devolver la plata
      </Button>

      {preview.eventStatus === "cancelled" ? (
        <p className="mt-3 text-center text-xs text-red-200/70">
          Este evento ya figura como cancelado.
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-red-500/30 bg-zinc-950 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-200">
              <ShieldAlert className="size-5" aria-hidden="true" />
              Confirmá la cancelación
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Tené cuidado: vas a anular {formatNumber(preview.validTickets)}{" "}
              entradas y devolver la plata de{" "}
              <span className="font-semibold text-zinc-200">
                {preview.eventTitle}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="mass-refund-confirm"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
              >
                Escribí exactamente: {CONFIRM_PHRASE}
              </label>
              <Input
                id="mass-refund-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                disabled={isPending}
                className="h-11 border-red-500/30 bg-black/40 font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="mass-refund-reason"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
              >
                Motivo de la cancelación
              </label>
              <Input
                id="mass-refund-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={isPending}
                placeholder="Ej: Suspendido por tormenta / disposición municipal"
                className="h-11 border-zinc-700 bg-black/40 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="border-zinc-700 bg-transparent text-zinc-300"
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || isPending}
              onClick={handleExecute}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <OctagonAlert />
              )}
              Confirmar y devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
