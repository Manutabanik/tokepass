"use client"

import { Loader2, Users, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  settlePromoterCommissions,
  type PromoterRow,
} from "@/app/actions/promoters"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from "@/lib/format"

export function PromotersTeamTable({
  initialPromoters,
}: {
  initialPromoters: PromoterRow[]
}) {
  const router = useRouter()
  const [promoters, setPromoters] = useState(initialPromoters)
  const [selected, setSelected] = useState<PromoterRow | null>(null)
  const [pending, startTransition] = useTransition()

  function settle() {
    if (!selected) return
    startTransition(async () => {
      const result = await settlePromoterCommissions(selected.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setPromoters((current) =>
        current.map((row) =>
          row.id === selected.id
            ? {
                ...row,
                settledCommission: row.settledCommission + result.amount,
                pendingCommission: 0,
                lastSettledAt: result.settledAt,
              }
            : row,
        ),
      )
      setSelected(null)
      toast.success("Saldo marcado como pagado.")
      router.refresh()
    })
  }

  if (promoters.length === 0) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-zinc-200 px-4 py-14 text-center dark:border-white/10">
        <Users className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-4 text-base font-semibold text-foreground">
          Todavía no tenés promotores
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Agregá el primero y compartí su link en Instagram / WhatsApp.
        </p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-200 hover:bg-transparent dark:border-white/8">
            <TableHead className="text-muted-foreground">Nombre</TableHead>
            <TableHead className="text-muted-foreground">Código</TableHead>
            <TableHead className="text-muted-foreground">Comisión</TableHead>
            <TableHead className="text-right text-muted-foreground">
              Clics
            </TableHead>
            <TableHead className="text-right text-muted-foreground">
              Entradas
            </TableHead>
            <TableHead className="text-right text-muted-foreground">
              Recaudación
            </TableHead>
            <TableHead className="text-right text-muted-foreground">
              A pagar
            </TableHead>
            <TableHead className="text-right text-muted-foreground">
              Acciones
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promoters.map((promoter) => (
            <TableRow
              key={promoter.id}
              className="border-zinc-200 hover:bg-zinc-50 dark:border-white/8 dark:hover:bg-white/[0.02]"
            >
              <TableCell className="font-medium text-foreground">
                {promoter.name}
                {!promoter.userId && (
                  <Badge
                    variant="outline"
                    className="ml-2 rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                  >
                    Sin reclamar
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <code className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold tracking-wide text-violet-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-violet-300 dark:ring-white/10">
                  {promoter.referralCode}
                </code>
              </TableCell>
              <TableCell className="text-foreground">
                {promoter.commissionType === "fixed"
                  ? `${formatCurrency(promoter.commissionFixedAmount)} / entrada`
                  : formatPercent(promoter.commissionRate * 100, 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatNumber(promoter.clickCount)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatNumber(promoter.ticketsSold)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatCurrency(promoter.revenueGenerated)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-300">
                {formatCurrency(promoter.pendingCommission)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={promoter.pendingCommission <= 0}
                  onClick={() => setSelected(promoter)}
                  className="rounded-full"
                >
                  <Wallet className="size-3.5" aria-hidden />
                  Liquidar Comisiones
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
      >
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Liquidar comisiones</DialogTitle>
            <DialogDescription>
              {selected
                ? `Registrá el pago de ${selected.name}. El saldo pendiente queda en cero.`
                : "Registrá el pago al promotor."}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-3">
                <p className="text-sm text-muted-foreground">Saldo pendiente</p>
                <p className="text-lg font-black tabular-nums text-foreground">
                  {formatCurrency(selected.pendingCommission)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Comisión acumulada: {formatCurrency(selected.estimatedCommission)}
                . Ya liquidado: {formatCurrency(selected.settledCommission)}.
              </p>
              <p className="text-sm text-muted-foreground">
                {selected.lastSettledAt
                  ? `Última liquidación: ${formatDateTime(selected.lastSettledAt)}.`
                  : "Todavía no hay liquidaciones registradas."}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={settle}
              disabled={pending || !selected || selected.pendingCommission <= 0}
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                <>
                  <Wallet className="size-4" aria-hidden />
                  Marcar saldo como Pagado
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
