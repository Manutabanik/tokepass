"use client"

import { CheckCircle2, LoaderCircle, ShieldCheck, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  reviewOrganizerBankProfile,
  type PendingBankProfileRow,
} from "@/app/actions/organizer-bank"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"

export function BankReviewPanel({
  initialRows,
}: {
  initialRows: PendingBankProfileRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function decide(row: PendingBankProfileRow, decision: "verified" | "rejected") {
    startTransition(async () => {
      const result = await reviewOrganizerBankProfile(
        row.id,
        decision,
        decision === "rejected"
          ? "CBU/CUIT no coincide con el titular o está incompleto."
          : undefined,
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        decision === "verified" ? "Cuenta bancaria verificada" : "Cuenta rechazada",
      )
      router.refresh()
    })
  }

  if (initialRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        No hay cuentas de cobro pendientes de validación.
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {initialRows.map((row) => (
        <article
          key={row.id}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{row.fullNameOrCompany}</p>
            <p className="text-sm text-muted-foreground">
              {row.organizerName} · {row.organizerEmail}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              CUIT {row.taxId}
              {row.cbu ? ` · CBU ${row.cbu}` : ""}
              {row.alias ? ` · Alias ${row.alias}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Actualizado {formatDateTime(row.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => decide(row, "verified")}
              className="min-h-10 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Verificar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => decide(row, "rejected")}
              className="min-h-10 border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200"
            >
              <XCircle className="size-4" />
              Rechazar
            </Button>
          </div>
        </article>
      ))}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Verificar solo si el titular coincide con el CUIT/DNI registrado.
      </p>
    </div>
  )
}
