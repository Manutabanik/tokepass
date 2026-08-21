"use client"

import {
  ArrowRightLeft,
  CheckCircle,
  LoaderCircle,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  completePayoutRequest,
  rejectPayoutRequest,
  type PlatformPayoutRequestRow,
} from "@/app/actions/payouts"
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

export function PlatformPayoutsPanel({
  initialRows,
}: {
  initialRows: PlatformPayoutRequestRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rejectTarget, setRejectTarget] =
    useState<PlatformPayoutRequestRow | null>(null)
  const [rejectNotes, setRejectNotes] = useState("")

  function markTransferred(row: PlatformPayoutRequestRow) {
    startTransition(async () => {
      const result = await completePayoutRequest(row.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Marcado como transferido", {
        description: `${row.organizerName} · ${formatCurrency(row.amount)}`,
      })
      router.refresh()
    })
  }

  function confirmReject() {
    if (!rejectTarget) return
    startTransition(async () => {
      const result = await rejectPayoutRequest(
        rejectTarget.id,
        rejectNotes.trim() || undefined,
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Retiro rechazado")
      setRejectTarget(null)
      setRejectNotes("")
      router.refresh()
    })
  }

  if (initialRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        No hay solicitudes de retiro pendientes.
      </div>
    )
  }

  return (
    <>
      {/* Mobile data cards */}
      <div className="grid gap-3 md:hidden">
        {initialRows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">
                  {row.organizerName}
                </p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {row.organizerEmail}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.eventTitle ?? "Retiro general"}
                </p>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-amber-500/40 bg-amber-500/15 text-[10px] uppercase text-amber-800 dark:text-amber-100"
              >
                Pendiente
              </Badge>
            </div>
            <p className="mt-4 font-mono text-3xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatCurrency(row.amount)}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              CBU {row.cbuDestination}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(row.createdAt)}
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => markTransferred(row)}
                className="min-h-12 w-full rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <CheckCircle className="size-4" />
                )}
                Marcar como Transferido
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setRejectTarget(row)
                  setRejectNotes("")
                }}
                className="min-h-12 w-full rounded-xl border-rose-500/40 bg-rose-500/15 font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-200"
              >
                <XCircle className="size-4" />
                Rechazar
              </Button>
            </div>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Productora</th>
              <th className="px-5 py-3 font-medium">Evento</th>
              <th className="px-5 py-3 font-medium">Monto</th>
              <th className="px-5 py-3 font-medium">CBU / CVU</th>
              <th className="px-5 py-3 font-medium">Fecha</th>
              <th className="px-5 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border hover:bg-muted/50"
              >
                <td className="min-w-[150px] max-w-[250px] px-5 py-4">
                  <p className="truncate font-medium text-foreground">
                    {row.organizerName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.organizerEmail}
                  </p>
                </td>
                <td className="min-w-[150px] max-w-[250px] px-5 py-4 text-muted-foreground">
                  <span className="block truncate">
                    {row.eventTitle ?? "Retiro general"}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                  {row.cbuDestination}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full text-[10px] uppercase",
                        "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-100",
                      )}
                    >
                      Pendiente
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => markTransferred(row)}
                      className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      {pending ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="size-3.5" />
                      )}
                      Marcar como Transferido
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setRejectTarget(row)
                        setRejectNotes("")
                      }}
                      className="min-h-11 border-rose-500/40 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 dark:text-rose-200"
                    >
                      <XCircle className="size-3.5" />
                      Rechazar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
      >
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-200">
              <XCircle className="size-4" />
              Rechazar retiro
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {rejectTarget
                ? `${rejectTarget.organizerName} · ${formatCurrency(rejectTarget.amount)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-notes">Motivo (opcional)</Label>
            <Input
              id="reject-notes"
              value={rejectNotes}
              onChange={(event) => setRejectNotes(event.target.value)}
              placeholder="Ej. CBU incorrecto"
              className="min-h-12 border-border bg-background text-base"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRejectTarget(null)}
              className="min-h-12 border-border"
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={confirmReject}
              className="min-h-12 bg-red-600 text-white hover:bg-red-500"
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <XCircle />
              )}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function PlatformPayoutsHeader() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-400/80">
        Dueño de la Plataforma
      </p>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-black tracking-tight text-foreground">
        <ArrowRightLeft className="size-7 text-sky-600 dark:text-sky-300" />
        Liquidaciones
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Control de caja: auditá retiros, transferí y dejá motivo si rechazás.
      </p>
    </div>
  )
}
