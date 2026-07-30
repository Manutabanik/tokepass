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
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-400/80">
          Platform OS
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
          Liquidaciones
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Completá las solicitudes pending cuando el pago al organizador esté
          transferido.
        </p>
      </div>

      {initialRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
          No hay liquidaciones todavía.
        </div>
      ) : (
        <div className="grid gap-2">
          {initialRows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <p className="font-medium text-white">
                  {row.organizerName}
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    {row.organizerEmail}
                  </span>
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {row.periodLabel ?? "Liquidación"} · Neto{" "}
                  {formatCurrency(row.netAmount)}
                </p>
                <p className="text-xs text-zinc-600">
                  Bruto {formatCurrency(row.grossAmount)} · Fee{" "}
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
                      ? "border-emerald-500/40 text-emerald-200"
                      : "border-amber-500/40 text-amber-100",
                  )}
                >
                  {row.status}
                </Badge>
                {row.status === "pending" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    className="rounded-full bg-sky-600 text-white hover:bg-sky-500"
                    onClick={() => {
                      startTransition(async () => {
                        const result = await completeSettlement(row.id)
                        if (!result.success) {
                          toast.error(result.error)
                          return
                        }
                        toast.success("Liquidación marcada como completed")
                        router.refresh()
                      })
                    }}
                  >
                    Completar
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
