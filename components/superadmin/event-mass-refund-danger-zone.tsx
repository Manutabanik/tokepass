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
  const [armed, setArmed] = useState(false)
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()

  const canSubmit =
    confirmText.trim() === CONFIRM_PHRASE && reason.trim().length >= 8

  function resetConfirm() {
    setConfirmText("")
    setReason("")
  }

  function handleExecute() {
    if (!canSubmit) return

    startTransition(async () => {
      const result = await executeMassEventRefund(preview.eventId, reason)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Devolución masiva ejecutada", {
        description: `${formatNumber(result.data.ordersRefunded)} compras reembolsadas · ${formatNumber(result.data.ticketsCancelled)} entradas anuladas${
          result.data.mpFailed > 0
            ? ` · ${formatNumber(result.data.mpFailed)} sin confirmar en la pasarela`
            : ""
        }`,
      })
      setOpen(false)
      setArmed(false)
      resetConfirm()
      router.refresh()
    })
  }

  return (
    <section className="rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-500/15 via-card to-card p-6 text-card-foreground shadow-[0_0_40px_rgba(239,68,68,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
            <OctagonAlert className="size-3.5" aria-hidden="true" />
            Zona de Peligro
          </p>
          <h2 className="mt-2 text-xl font-black text-foreground">
            Cancelar evento y devolver la plata
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-rose-900/70 dark:text-rose-100/70">
            Solo Super Admin. Primero se pide el reembolso a Mercado Pago.
            Solo si la pasarela confirma el éxito se anulan esa compra y
            sus códigos QR.
          </p>
          {preview.cancellationRequestReason ? (
            <p className="mt-3 max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              Motivo del organizador: {preview.cancellationRequestReason}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-right">
          <p className="font-mono text-2xl font-black text-rose-700 dark:text-rose-200 sm:text-3xl">
            {formatNumber(preview.validTickets)}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-rose-700/70 dark:text-rose-300/70">
            entradas en riesgo
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background/80 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Compras pagadas
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">
            {formatNumber(preview.paidOrders)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/80 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Plata a devolver
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">
            {formatCurrency(preview.refundableAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/80 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Estado financiero
          </p>
          <p className="mt-1 text-sm font-bold text-amber-800 dark:text-amber-200">
            {riskLabel(preview.riskTier)}
          </p>
        </div>
      </div>

      {!armed ? (
        <Button
          type="button"
          disabled={preview.eventStatus === "cancelled" || isPending}
          onClick={() => setArmed(true)}
          className={cn(
            "mt-6 min-h-12 h-12 w-full rounded-2xl border border-rose-500/40 bg-rose-500/15 text-sm font-bold uppercase tracking-wide text-rose-800",
            "hover:bg-rose-500/25 dark:text-rose-100",
          )}
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          Armar cancelación (paso 1 de 2)
        </Button>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-3 text-center text-xs leading-5 text-amber-900 dark:text-amber-100">
            Acción armada. Tocá de nuevo solo si querés abrir la confirmación
            final. Podés desarmar si fue un toque accidental.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setArmed(false)}
              className="min-h-12 border-border bg-transparent text-muted-foreground hover:text-foreground"
            >
              Desarmar
            </Button>
            <Button
              type="button"
              disabled={preview.eventStatus === "cancelled" || isPending}
              onClick={() => {
                resetConfirm()
                setOpen(true)
              }}
              className={cn(
                "min-h-12 rounded-2xl bg-red-600 text-sm font-bold uppercase tracking-wide text-white",
                "shadow-[0_0_28px_rgba(220,38,38,0.35)] hover:bg-red-500",
              )}
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
              Abrir confirmación (paso 2)
            </Button>
          </div>
        </div>
      )}

      {preview.eventStatus === "cancelled" ? (
        <p className="mt-3 text-center text-xs text-rose-700/80 dark:text-rose-200/70">
          Este evento ya figura como cancelado.
        </p>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) resetConfirm()
        }}
      >
        <DialogContent className="border-rose-500/30 bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-200">
              <ShieldAlert className="size-5" aria-hidden="true" />
              Confirmá la cancelación
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tené cuidado: vas a anular {formatNumber(preview.validTickets)}{" "}
              entradas y devolver la plata de{" "}
              <span className="font-semibold text-foreground">
                {preview.eventTitle}
              </span>
              . Esta acción exige autenticación MFA (AAL2) en tu sesión de Super
              Admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="mass-refund-confirm"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Escribí exactamente: {CONFIRM_PHRASE}
              </label>
              <Input
                id="mass-refund-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                disabled={isPending}
                className="min-h-12 border-rose-500/30 bg-background font-mono text-base"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label
                htmlFor="mass-refund-reason"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Motivo de la cancelación
              </label>
              <Input
                id="mass-refund-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={isPending}
                placeholder="Ej: Suspendido por tormenta / disposición municipal"
                className="min-h-12 border-border bg-background text-base"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="min-h-12 border-border bg-transparent text-muted-foreground"
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || isPending}
              onClick={handleExecute}
              className="min-h-12 bg-red-600 text-white hover:bg-red-500"
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
