"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  completeSettlement,
  type PlatformSettlementRow,
} from "@/app/actions/superadmin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export function PlatformSettlementsPanel({
  initialRows,
}: {
  initialRows: PlatformSettlementRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      {initialRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No hay liquidaciones legacy.
        </div>
      ) : (
        <div className="grid gap-2">
          {initialRows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <p className="font-medium text-foreground">
                  {row.organizerName}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {row.organizerEmail}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.periodLabel ?? "Liquidación"} · Neto{" "}
                  {formatCurrency(row.netAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Bruto {formatCurrency(row.grossAmount)} · Comisión{" "}
                  {formatCurrency(row.platformFee)} ·{" "}
                  {new Date(row.createdAt).toLocaleString("es-AR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full text-[10px] uppercase",
                    row.status === "completed"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                      : "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-100",
                  )}
                >
                  {row.status === "completed" ? "Transferida" : "Pendiente"}
                </Badge>
                {row.status === "pending" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    className="min-h-12 rounded-xl bg-sky-600 px-4 font-semibold text-foreground hover:bg-sky-500 lg:min-h-9 lg:rounded-full"
                    onClick={() => {
                      startTransition(async () => {
                        const result = await completeSettlement(row.id)
                        if (!result.success) {
                          toast.error(result.error)
                          return
                        }
                        toast.success("Liquidación marcada como transferida")
                        router.refresh()
                      })
                    }}
                  >
                    Marcar como Transferido
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
