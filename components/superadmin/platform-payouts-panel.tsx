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
      <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
        No hay solicitudes de retiro pendientes.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/8 text-xs uppercase tracking-wide text-zinc-600">
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
                className="border-b border-white/6 hover:bg-white/[0.025]"
              >
                <td className="px-5 py-4">
                  <p className="font-medium text-zinc-100">{row.organizerName}</p>
                  <p className="text-xs text-zinc-600">{row.organizerEmail}</p>
                </td>
                <td className="px-5 py-4 text-zinc-400">
                  {row.eventTitle ?? "Retiro general"}
                </td>
                <td className="px-5 py-4 font-mono font-semibold text-emerald-300">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-zinc-400">
                  {row.cbuDestination}
                </td>
                <td className="px-5 py-4 text-zinc-500">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full text-[10px] uppercase",
                        "border-amber-500/40 text-amber-100",
                      )}
                    >
                      Pendiente
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => markTransferred(row)}
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
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
                      className="border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
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

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-200">
              <XCircle className="size-4" />
              Rechazar retiro
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
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
              className="h-11 border-zinc-700 bg-black/40"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRejectTarget(null)}
              className="border-zinc-700"
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={confirmReject}
              className="bg-red-600 text-white hover:bg-red-500"
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
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-400/80">
        Dueño de la Plataforma
      </p>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-black tracking-tight text-white">
        <ArrowRightLeft className="size-7 text-sky-300" />
        Liquidaciones
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        Control de caja: auditá retiros, transferí y dejá motivo si rechazás.
      </p>
    </div>
  )
}
