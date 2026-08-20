"use client"

import { LoaderCircle } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"

import { getResaleFeePercentage } from "@/app/actions/platform-settings"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import { computeResaleFeeSplit, formatResaleFeePercentage } from "@/lib/resale"
import { cn } from "@/lib/utils"

export function ResaleConfirmDialog({
  open,
  onOpenChange,
  eventTitle,
  nominalValue,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventTitle: string
  nominalValue: number
  pending: boolean
  onConfirm: () => void
}) {
  const checkboxId = useId()
  const [accepted, setAccepted] = useState(false)
  const [feePercentage, setFeePercentage] = useState<number | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setAccepted(false)
      setFeePercentage(null)
    }
    onOpenChange(next)
  }

  useEffect(() => {
    if (!open) return

    let cancelled = false
    void getResaleFeePercentage().then((percentage) => {
      if (!cancelled) {
        setFeePercentage(percentage)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open])

  const breakdown = useMemo(() => {
    if (feePercentage == null) return null
    return computeResaleFeeSplit(nominalValue, feePercentage)
  }, [feePercentage, nominalValue])

  const canConfirm = Boolean(accepted && breakdown && !pending)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        role="alertdialog"
        className="sm:max-w-md"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>Publicar entrada en el mercado oficial</DialogTitle>
          <DialogDescription>
            Vas a publicar tu acceso a{" "}
            <span className="font-medium text-foreground">{eventTitle}</span>{" "}
            en el marketplace de TokePass.
          </DialogDescription>
        </DialogHeader>

        {breakdown ? (
          <ul className="space-y-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-foreground">
            <li>
              Precio original de la entrada: {formatCurrency(breakdown.price)}
            </li>
            <li>
              {`Costo administrativo (${formatResaleFeePercentage(breakdown.feePercentage)}%): -${formatCurrency(breakdown.platformFeeAmount)}`}
            </li>
            <li className="border-t border-border pt-2 font-bold">
              Dinero exacto a recibir:{" "}
              {formatCurrency(breakdown.sellerNetAmount)}
            </li>
          </ul>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Calculando desglose
          </div>
        )}

        <p className="text-xs text-slate-500">
          El dinero será reintegrado a tu medio de pago original en un plazo de
          10 a 30 días hábiles una vez que otro usuario compre tu lugar.
        </p>

        <label
          htmlFor={checkboxId}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition",
            accepted && "border-primary/40 bg-primary/5",
            pending && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={accepted}
            disabled={pending}
            required
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span className="text-xs leading-5 text-muted-foreground">
            Comprendo que al publicar mi entrada, mi código QR quedará
            inhabilitado para ingresar al evento. Podré cancelar la venta en
            cualquier momento si nadie la ha comprado aún.
          </span>
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="rounded-xl bg-orange-600 text-white hover:bg-orange-700"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Confirmar publicación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
